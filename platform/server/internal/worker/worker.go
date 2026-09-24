package worker

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"

	"raspos/platform/server/internal/blob"
	"raspos/platform/server/internal/compact"
	"raspos/platform/server/internal/db"
	"raspos/platform/server/internal/hint"
	"raspos/platform/server/internal/ingest"
)

const TaskQueue = "timacad"

type Activities struct {
	Pool       *pgxpool.Pool
	Sources    ingest.Fetcher
	Objects    blob.Store
	Hints      hint.Publisher
	CompactBin string
}

func (a *Activities) IngestURL(ctx context.Context, pageURL string) (ingest.Outcome, error) {
	return ingest.Run(ctx, a.Pool, a.Sources, a.Objects, pageURL)
}

func (a *Activities) PublishPendingHints(ctx context.Context) error {
	_, err := hint.PublishPending(ctx, db.New(a.Pool), a.Hints)
	return err
}

func (a *Activities) CompactDocs(ctx context.Context) error {
	_, err := compact.Run(ctx, a.Pool, a.CompactBin)
	return err
}

func activityContext(ctx workflow.Context) workflow.Context {
	return workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy:         &temporal.RetryPolicy{MaximumAttempts: 3},
	})
}

// IngestSource downloads one page, stores it, and commits a snapshot only when the bytes parse.
func IngestSource(ctx workflow.Context, pageURL string) (ingest.Outcome, error) {
	ctx = activityContext(ctx)
	var result ingest.Outcome
	if err := workflow.ExecuteActivity(ctx, "IngestURL", pageURL).Get(ctx, &result); err != nil {
		return result, err
	}
	if err := workflow.ExecuteActivity(ctx, "PublishPendingHints").Get(ctx, nil); err != nil {
		return result, err
	}
	return result, nil
}

// CompactPersonal runs the daily compaction of personal Loro documents.
func CompactPersonal(ctx workflow.Context) error {
	ctx = activityContext(ctx)
	return workflow.ExecuteActivity(ctx, "CompactDocs").Get(ctx, nil)
}
