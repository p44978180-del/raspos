package hint

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"raspos/platform/server/internal/db"
)

// PublishPending drains hints that were committed with a snapshot.
// A failed publish stays in the outbox and is retried.
func PublishPending(ctx context.Context, queries *db.Queries, publisher Publisher) (int, error) {
	if publisher == nil {
		return 0, nil
	}
	rows, err := queries.ListUnpublishedHints(ctx)
	if err != nil {
		return 0, err
	}
	sent := 0
	for _, row := range rows {
		if err := publisher.Publish(ctx, Hint{Collection: row.Collection, ScopeID: row.ScopeID, LSN: row.Lsn}); err != nil {
			return sent, err
		}
		if err := queries.MarkHintPublished(ctx, db.MarkHintPublishedParams{
			ID: row.ID, PublishedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		}); err != nil {
			return sent, err
		}
		sent++
	}
	return sent, nil
}
