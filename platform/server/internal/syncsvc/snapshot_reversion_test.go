package syncsvc

import (
	"context"
	"fmt"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"
	"raspos/platform/server/internal/blob"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	"raspos/platform/server/internal/ingest"
	"raspos/platform/server/internal/schema"
)

type revertingSource struct{ subject string }

func (s *revertingSource) Get(context.Context, string) (int, []byte, error) {
	return 200, []byte(fmt.Sprintf(`<h2 class="group-selected-title">Группа REV-101</h2>
<div class="group-schedule-head-date"><b class="fw-semibold">27.09.2026</b></div>
<li class="group-schedule-lesson-item"><b class="group-schedule-time-range">09:00-10:30</b>
<span class="group-schedule-subject">%s</span></li>`, s.subject)), nil
}

func TestIngestReversionPublishesNewLSNWithoutDuplicatingLessons(t *testing.T) {
	ctx := context.Background()
	url := startPostgres(t)
	if err := schema.Up(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	source := &revertingSource{}
	objects := &blob.Memory{}
	for i, subject := range []string{"Original", "Changed", "Original", "Original"} {
		source.subject = subject
		outcome, err := ingest.Run(ctx, pool, source, objects, "https://example.invalid/schedule")
		if err != nil {
			t.Fatal(err)
		}
		if i == 3 {
			if outcome.Status != "noop" || outcome.LSN != 0 {
				t.Fatalf("unchanged: %+v", outcome)
			}
		} else if outcome.Status != "applied" || outcome.LSN != int64(i+1) {
			t.Fatalf("transition %d: %+v", i, outcome)
		}
	}
	q := db.New(pool)
	count, err := q.CountLessons(ctx)
	if err != nil || count != 1 {
		t.Fatalf("current count %d: %v", count, err)
	}
	var total, pending int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM lesson").Scan(&total); err != nil {
		t.Fatal(err)
	}
	if total != 2 {
		t.Fatalf("duplicated historical lessons: %d", total)
	}
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM hint_outbox").Scan(&pending); err != nil {
		t.Fatal(err)
	}
	if pending != 3 {
		t.Fatalf("expected a hint per transition: %d", pending)
	}
	latest, err := q.LatestSyncOp(ctx, db.LatestSyncOpParams{Collection: "lesson", ScopeID: "REV-101"})
	if err != nil {
		t.Fatal(err)
	}
	var op syncv1.SyncOp
	if err := proto.Unmarshal(latest.Op, &op); err != nil {
		t.Fatal(err)
	}
	if latest.Lsn != 3 || op.GetLessons().GetLessons()[0].GetSubject() != "Original" {
		t.Fatalf("latest sync snapshot did not revert: %v", &op)
	}
}
