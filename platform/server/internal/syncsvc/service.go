package syncsvc

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"

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
	if s.Pool == nil {
		return connect.NewError(connect.CodeInternal, errors.New("database pool is not configured"))
	}
	// All frames come from one database snapshot. Resolve the complete bundle
	// before writing any response, so a missing collection cannot look like success.
	tx, err := s.Pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	now := time.Now().UTC().UnixMilli()
	read := func(collection, scope string) (*syncv1.BootstrapResponse, error) {
		row, err := queries.LatestSyncOp(ctx, db.LatestSyncOpParams{Collection: collection, ScopeID: scope})
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, connect.NewError(connect.CodeNotFound, errors.New("bootstrap bundle is not imported"))
		}
		if err != nil {
			return nil, err
		}
		return &syncv1.BootstrapResponse{Lsn: row.Lsn, Collection: collection, ScopeId: scope, Op: row.Op, SnapshotReset: true, ServerTimeUnixMs: now}, nil
	}
	directory, err := read(ingest.CollectionDirectory, ingest.ScopeCatalog)
	if err != nil {
		return err
	}
	code := req.Msg.GetGroupCode()
	if code == "" {
		var op syncv1.SyncOp
		if err := proto.Unmarshal(directory.Op, &op); err != nil || op.GetDirectory() == nil {
			return connect.NewError(connect.CodeInternal, errors.New("directory snapshot is invalid"))
		}
		for _, group := range op.GetDirectory().GetGroups() {
			if code == "" || group.GetStatus() == "current" {
				code = group.GetGroupCode()
			}
			if group.GetStatus() == "current" {
				break
			}
		}
		if code == "" {
			return connect.NewError(connect.CodeNotFound, errors.New("directory contains no groups"))
		}
	}
	lessons, err := read(ingest.CollectionLesson, code)
	if err != nil {
		return err
	}
	campus, err := read(ingest.CollectionCampus, ingest.ScopeCampus)
	if err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	for _, frame := range []*syncv1.BootstrapResponse{directory, lessons, campus} {
		if err := stream.Send(frame); err != nil {
			return err
		}
	}
	return nil
}
