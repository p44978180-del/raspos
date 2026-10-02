package ingest

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/campus"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
)

const CollectionCampus = "campus_graph"
const ScopeCampus = "campus"

// ImportCampus publishes the embedded map once per changed version. The same
// scope lock protects concurrent server starts from issuing duplicate versions.
func ImportCampus(ctx context.Context, pool *pgxpool.Pool) error {
	op, err := proto.Marshal(&syncv1.SyncOp{Body: &syncv1.SyncOp_Campus{Campus: campus.Snapshot()}})
	if err != nil {
		return err
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	if err := queries.LockSyncScope(ctx, CollectionCampus+"|"+ScopeCampus); err != nil {
		return err
	}
	if _, _, err := appendLogTx(ctx, queries, CollectionCampus, ScopeCampus, op); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
