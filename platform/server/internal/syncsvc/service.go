package syncsvc

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"raspos/platform/server/internal/authz"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	"raspos/platform/server/internal/ingest"
)

type Service struct {
	Pool    *pgxpool.Pool
	Queries *db.Queries
	Authz   authz.Checker
}

func (s *Service) Bootstrap(ctx context.Context, req *connect.Request[syncv1.BootstrapRequest], stream *connect.ServerStream[syncv1.BootstrapResponse]) error {
	if _, err := uuid.Parse(req.Msg.GetReplicaId()); err != nil {
		return connect.NewError(connect.CodeInvalidArgument, errors.New("replica_id must be a UUID"))
	}
	collection := ingest.CollectionDirectory
	scope := ingest.ScopeCatalog
	if code := req.Msg.GetGroupCode(); code != "" {
		collection = ingest.CollectionLesson
		scope = code
	}
	row, err := s.Queries.LatestSyncOp(ctx, db.LatestSyncOpParams{Collection: collection, ScopeID: scope})
	if errors.Is(err, pgx.ErrNoRows) {
		return connect.NewError(connect.CodeNotFound, errors.New("snapshot is not imported"))
	}
	if err != nil {
		return err
	}
	return stream.Send(&syncv1.BootstrapResponse{
		Lsn:              row.Lsn,
		Collection:       collection,
		ScopeId:          scope,
		Op:               row.Op,
		SnapshotReset:    true,
		ServerTimeUnixMs: time.Now().UTC().UnixMilli(),
	})
}
