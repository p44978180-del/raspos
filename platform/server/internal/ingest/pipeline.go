package ingest

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/blob"
	"raspos/platform/server/internal/canonical"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	"raspos/platform/server/internal/hint"
	"raspos/platform/server/internal/journalhtml"
)

const journalParser = "journal-html-1"
const maxSourceBytes = 32 << 20

// Fetcher downloads one source. Parsing never calls it.
type Fetcher interface {
	Get(ctx context.Context, url string) (int, []byte, error)
}

type Outcome struct {
	Status     string `json:"status"`
	GroupCode  string `json:"group_code"`
	ContentSHA string `json:"content_sha"`
	LessonHash string `json:"lesson_hash"`
	LSN        int64  `json:"lsn"`
}

// Run stores the response, then parses the stored bytes.
// A failed fetch, a PDF, or a page with no lessons leaves every snapshot untouched.
func Run(ctx context.Context, pool *pgxpool.Pool, sources Fetcher, objects blob.Store, pageURL string) (Outcome, error) {
	status, body, err := sources.Get(ctx, pageURL)
	if err != nil {
		return Outcome{}, err
	}
	if status < 200 || status >= 300 {
		return Outcome{}, fmt.Errorf("source status %d", status)
	}
	if len(body) == 0 || len(body) > maxSourceBytes {
		return Outcome{}, fmt.Errorf("source body is empty or larger than 32 MiB")
	}
	contentHash := hint.ContentHash(body)
	if err := objects.Put(ctx, contentHash, body); err != nil {
		return Outcome{}, err
	}
	stored, err := objects.Get(ctx, contentHash)
	if err != nil {
		return Outcome{}, err
	}
	if !bytes.Equal(stored, body) {
		return Outcome{}, errors.New("stored source bytes differ from the download")
	}
	queries := db.New(pool)
	previous, err := queries.LatestSourceHash(ctx, pageURL)
	if err == nil && previous == contentHash {
		return Outcome{Status: "noop", ContentSHA: contentHash}, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return Outcome{}, err
	}
	page, err := journalhtml.Parse(stored, pageURL)
	if err != nil || len(page.Lessons) == 0 {
		return Outcome{Status: "stored", ContentSHA: contentHash}, nil
	}
	lsn, lessonHash, err := commitPage(ctx, pool, pageURL, contentHash, page)
	if err != nil {
		return Outcome{}, err
	}
	state := "applied"
	if lsn == 0 {
		state = "noop"
	}
	return Outcome{Status: state, GroupCode: page.Code, ContentSHA: contentHash, LessonHash: lessonHash, LSN: lsn}, nil
}

func commitPage(ctx context.Context, pool *pgxpool.Pool, pageURL, contentHash string, page journalhtml.Page) (int64, string, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return 0, "", err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	instituteID, err := queries.UpsertInstitute(ctx, db.UpsertInstituteParams{
		ID: uuid.Must(uuid.NewV7()), Code: "rgau", Name: "РГАУ-МСХА",
	})
	if err != nil {
		return 0, "", err
	}
	groupID, err := queries.UpsertStudentGroup(ctx, db.UpsertStudentGroupParams{
		ID: uuid.Must(uuid.NewV7()), InstituteID: instituteID, Code: page.Code,
		ExternalID: int32(page.ExternalID), Course: int32(page.Course),
		Degree: "", StudyForm: "", Status: "current",
	})
	if err != nil {
		return 0, "", err
	}
	lessonHash := canonical.Hash(page.Lessons)
	if _, err := queries.FindSnapshot(ctx, db.FindSnapshotParams{GroupID: groupID, ContentSha256: lessonHash}); err == nil {
		if err := tx.Commit(ctx); err != nil {
			return 0, "", err
		}
		return 0, lessonHash, nil
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return 0, "", err
	}
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if err := queries.SupersedeSnapshots(ctx, db.SupersedeSnapshotsParams{GroupID: groupID, SupersededAt: now, ContentSha256: lessonHash}); err != nil {
		return 0, "", err
	}
	documentID, err := queries.InsertSourceDocument(ctx, db.InsertSourceDocumentParams{
		ID: uuid.Must(uuid.NewV7()), Url: pageURL, ContentSha256: contentHash, FetchedAt: now,
	})
	if err != nil {
		return 0, "", err
	}
	snapshotID, err := queries.InsertSnapshot(ctx, db.InsertSnapshotParams{
		ID: uuid.Must(uuid.NewV7()), GroupID: groupID, DocumentID: documentID,
		ParserVersion: journalParser, ContentSha256: lessonHash, LessonCount: int32(len(page.Lessons)),
		ValidFrom: now,
	})
	if err != nil {
		return 0, "", err
	}
	rows, protoLessons, err := lessonRows(snapshotID, groupID, page.Lessons)
	if err != nil {
		return 0, "", err
	}
	if len(rows) > 0 {
		if _, err := queries.InsertLesson(ctx, rows); err != nil {
			return 0, "", err
		}
	}
	op, err := proto.Marshal(&syncv1.SyncOp{Body: &syncv1.SyncOp_Lessons{Lessons: &syncv1.LessonSnapshot{
		GroupCode: page.Code, SnapshotHash: lessonHash, Lessons: protoLessons,
	}}})
	if err != nil {
		return 0, "", err
	}
	lsn, inserted, err := appendLogTx(ctx, queries, CollectionLesson, page.Code, op)
	if err != nil {
		return 0, "", err
	}
	if inserted {
		if err := queries.InsertHint(ctx, db.InsertHintParams{
			ID: uuid.Must(uuid.NewV7()), Collection: CollectionLesson, ScopeID: page.Code, Lsn: lsn, CreatedAt: now,
		}); err != nil {
			return 0, "", err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, "", err
	}
	if !inserted {
		return 0, lessonHash, nil
	}
	return lsn, lessonHash, nil
}
