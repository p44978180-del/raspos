package ingest

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/canonical"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	"raspos/platform/server/internal/v4"
)

const parserVersion = "v4-json-1"

const (
	CollectionDirectory = "group_directory"
	CollectionLesson    = "lesson"
	ScopeCatalog        = "catalog"
)

type Result struct {
	Groups  int
	Lessons int
}

func Import(ctx context.Context, pool *pgxpool.Pool, publicRoot string) (Result, error) {
	catalog, err := v4.LoadCatalog(publicRoot)
	if err != nil {
		return Result{}, err
	}
	checkedAt, err := time.Parse(time.RFC3339Nano, catalog.Meta.CheckedAt)
	if err != nil {
		return Result{}, fmt.Errorf("checkedAt: %w", err)
	}
	queries := db.New(pool)
	entries := make([]*syncv1.DirectoryEntry, 0, len(catalog.Groups))
	sort.Slice(catalog.Groups, func(i, j int) bool { return catalog.Groups[i].Code < catalog.Groups[j].Code })
	for _, group := range catalog.Groups {
		if err := importGroup(ctx, queries, pool, publicRoot, group, checkedAt); err != nil {
			return Result{}, err
		}
		entries = append(entries, &syncv1.DirectoryEntry{
			GroupCode:     group.Code,
			InstituteCode: group.InstituteID,
			InstituteName: group.Institute,
			Course:        int32(group.Course),
			Status:        group.Status,
			ExternalId:    int32(group.ExternalID),
			Degree:        group.Degree,
			StudyForm:     group.StudyForm,
		})
	}
	op, err := proto.Marshal(&syncv1.SyncOp{Body: &syncv1.SyncOp_Directory{Directory: &syncv1.DirectorySnapshot{
		DataVersion: catalog.Meta.DataVersion,
		Groups:      entries,
	}}})
	if err != nil {
		return Result{}, err
	}
	if _, _, err := appendLog(ctx, queries, CollectionDirectory, ScopeCatalog, op); err != nil {
		return Result{}, err
	}
	groups, err := queries.CountGroups(ctx)
	if err != nil {
		return Result{}, err
	}
	lessons, err := queries.CountLessons(ctx)
	if err != nil {
		return Result{}, err
	}
	if int(groups) != catalog.Meta.TotalGroups || int(lessons) != catalog.Meta.TotalClasses {
		return Result{}, fmt.Errorf("imported groups %d lessons %d, catalog groups %d lessons %d", groups, lessons, catalog.Meta.TotalGroups, catalog.Meta.TotalClasses)
	}
	return Result{Groups: int(groups), Lessons: int(lessons)}, nil
}

func importGroup(ctx context.Context, queries *db.Queries, pool *pgxpool.Pool, publicRoot string, group v4.Group, checkedAt time.Time) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := queries.WithTx(tx)
	instituteID, err := q.UpsertInstitute(ctx, db.UpsertInstituteParams{
		ID: uuid.Must(uuid.NewV7()), Code: group.InstituteID, Name: group.Institute,
	})
	if err != nil {
		return err
	}
	groupID, err := q.UpsertStudentGroup(ctx, db.UpsertStudentGroupParams{
		ID: uuid.Must(uuid.NewV7()), InstituteID: instituteID, Code: group.Code,
		ExternalID: int32(group.ExternalID), Course: int32(group.Course),
		Degree: group.Degree, StudyForm: group.StudyForm, Status: group.Status,
	})
	if err != nil {
		return err
	}
	lessons, fileHash, err := v4.LoadLessons(publicRoot, group)
	if err != nil {
		return err
	}
	hash := canonical.Hash(lessons)
	if _, err := q.FindSnapshot(ctx, db.FindSnapshotParams{GroupID: groupID, ContentSha256: hash}); err == nil {
		return tx.Commit(ctx)
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if err := q.SupersedeSnapshots(ctx, db.SupersedeSnapshotsParams{GroupID: groupID, SupersededAt: now, ContentSha256: hash}); err != nil {
		return err
	}
	documentID, err := q.InsertSourceDocument(ctx, db.InsertSourceDocumentParams{
		ID: uuid.Must(uuid.NewV7()), Url: group.SourceURL, ContentSha256: fileHash,
		FetchedAt: pgtype.Timestamptz{Time: checkedAt.UTC(), Valid: true},
	})
	if err != nil {
		return err
	}
	snapshotID, err := q.InsertSnapshot(ctx, db.InsertSnapshotParams{
		ID: uuid.Must(uuid.NewV7()), GroupID: groupID, DocumentID: documentID,
		ParserVersion: parserVersion, ContentSha256: hash, LessonCount: int32(len(lessons)),
		ValidFrom: pgtype.Timestamptz{Time: checkedAt.UTC(), Valid: true},
	})
	if err != nil {
		return err
	}
	rows, protoLessons, err := lessonRows(snapshotID, groupID, lessons)
	if err != nil {
		return err
	}
	if len(rows) > 0 {
		if _, err := q.InsertLesson(ctx, rows); err != nil {
			return err
		}
	}
	op, err := proto.Marshal(&syncv1.SyncOp{Body: &syncv1.SyncOp_Lessons{Lessons: &syncv1.LessonSnapshot{
		GroupCode: group.Code, SnapshotHash: hash, Lessons: protoLessons,
	}}})
	if err != nil {
		return err
	}
	if _, _, err := appendLogTx(ctx, q, CollectionLesson, group.Code, op); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func lessonRows(snapshotID, groupID uuid.UUID, lessons []canonical.Lesson) ([]db.InsertLessonParams, []*syncv1.CanonicalLesson, error) {
	sort.Slice(lessons, func(i, j int) bool { return less(lessons[i], lessons[j]) })
	rows := make([]db.InsertLessonParams, 0, len(lessons))
	out := make([]*syncv1.CanonicalLesson, 0, len(lessons))
	for _, lesson := range lessons {
		occurs, err := time.Parse("2006-01-02", lesson.OccursOn)
		if err != nil {
			return nil, nil, err
		}
		start, err := clock(lesson.StartsAt)
		if err != nil {
			return nil, nil, err
		}
		end, err := clock(lesson.EndsAt)
		if err != nil {
			return nil, nil, err
		}
		rows = append(rows, db.InsertLessonParams{
			ID: uuid.Must(uuid.NewV7()), SnapshotID: snapshotID, GroupID: groupID,
			OccursOn: pgtype.Date{Time: occurs, Valid: true}, StartsAt: start, EndsAt: end,
			Subject: lesson.Subject, Kind: lesson.Kind, Teacher: lesson.Teacher,
			Building: lesson.Building, Room: lesson.Room, WeekType: lesson.WeekType, SourceUrl: lesson.SourceURL,
		})
		out = append(out, &syncv1.CanonicalLesson{
			OccursOn: lesson.OccursOn, StartsAt: lesson.StartsAt, EndsAt: lesson.EndsAt,
			Subject: lesson.Subject, Kind: lesson.Kind, Teacher: lesson.Teacher,
			Building: lesson.Building, Room: lesson.Room, WeekType: lesson.WeekType, SourceUrl: lesson.SourceURL,
		})
	}
	return rows, out, nil
}

func less(a, b canonical.Lesson) bool {
	left := [10]string{a.OccursOn, a.StartsAt, a.EndsAt, a.Subject, a.Kind, a.Teacher, a.Building, a.Room, a.WeekType, a.SourceURL}
	right := [10]string{b.OccursOn, b.StartsAt, b.EndsAt, b.Subject, b.Kind, b.Teacher, b.Building, b.Room, b.WeekType, b.SourceURL}
	for i := range left {
		if left[i] == right[i] {
			continue
		}
		return left[i] < right[i]
	}
	return false
}

func clock(value string) (pgtype.Time, error) {
	parsed, err := time.Parse("15:04", value)
	if err != nil {
		return pgtype.Time{}, err
	}
	micros := int64(parsed.Hour())*3_600_000_000 + int64(parsed.Minute())*60_000_000
	return pgtype.Time{Microseconds: micros, Valid: true}, nil
}

func appendLog(ctx context.Context, queries *db.Queries, collection, scope string, op []byte) (int64, bool, error) {
	return appendLogTx(ctx, queries, collection, scope, op)
}

func appendLogTx(ctx context.Context, queries *db.Queries, collection, scope string, op []byte) (int64, bool, error) {
	latest, err := queries.LatestSyncOp(ctx, db.LatestSyncOpParams{Collection: collection, ScopeID: scope})
	if err == nil && string(latest.Op) == string(op) {
		return latest.Lsn, false, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return 0, false, err
	}
	next, err := queries.NextLSN(ctx, db.NextLSNParams{Collection: collection, ScopeID: scope})
	if err != nil {
		return 0, false, err
	}
	recorded := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if err := queries.InsertSyncLog(ctx, db.InsertSyncLogParams{
		Collection: collection, ScopeID: scope, Lsn: next, Op: op, RecordedAt: recorded,
	}); err != nil {
		return 0, false, err
	}
	return next, true, nil
}
