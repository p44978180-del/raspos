package syncsvc

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	"raspos/platform/server/internal/session"
)

const (
	collectionPersonal = "personal"
	maxPersonalOpBytes = 8 * 1024 * 1024
)

func (s *Service) Pull(ctx context.Context, req *connect.Request[syncv1.PullRequest], stream *connect.ServerStream[syncv1.PullResponse]) error {
	if req.Msg.GetCollection() == "" || req.Msg.GetScopeId() == "" {
		return connect.NewError(connect.CodeInvalidArgument, errors.New("collection and scope_id are required"))
	}
	if req.Msg.GetSinceLsn() < 0 {
		return connect.NewError(connect.CodeInvalidArgument, errors.New("since_lsn must be zero or positive"))
	}
	rows, err := s.Queries.SyncOpsAfter(ctx, db.SyncOpsAfterParams{
		Collection: req.Msg.GetCollection(),
		ScopeID:    req.Msg.GetScopeId(),
		Lsn:        req.Msg.GetSinceLsn(),
	})
	if err != nil {
		return err
	}
	now := time.Now().UTC().UnixMilli()
	minimum, err := s.Queries.MinSyncLSN(ctx, db.MinSyncLSNParams{
		Collection: req.Msg.GetCollection(), ScopeID: req.Msg.GetScopeId(),
	})
	if err != nil {
		return err
	}
	if req.Msg.GetSinceLsn() > 0 && minimum > req.Msg.GetSinceLsn() {
		latest, err := s.Queries.LatestSyncOp(ctx, db.LatestSyncOpParams{
			Collection: req.Msg.GetCollection(), ScopeID: req.Msg.GetScopeId(),
		})
		if err != nil {
			return err
		}
		return stream.Send(&syncv1.PullResponse{
			Lsn: latest.Lsn, Op: latest.Op, ServerTimeUnixMs: now, SnapshotReset: true,
		})
	}
	for _, row := range rows {
		if err := stream.Send(&syncv1.PullResponse{
			Lsn: row.Lsn, Op: row.Op, ServerTimeUnixMs: now, SnapshotVersion: "",
		}); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) Push(ctx context.Context, req *connect.Request[syncv1.PushRequest]) (*connect.Response[syncv1.PushResponse], error) {
	replica, err := uuid.Parse(req.Msg.GetReplicaId())
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, errors.New("replica_id must be a UUID"))
	}
	if s.Pool == nil {
		return nil, connect.NewError(connect.CodeInternal, errors.New("database pool is not configured"))
	}
	principal, err := session.Principal(ctx, s.Queries, req.Header().Get("Authorization"))
	if err != nil {
		return nil, connect.NewError(connect.CodeUnauthenticated, err)
	}
	batchBytes := 0
	for _, operation := range req.Msg.GetOperations() {
		batchBytes += len(operation.GetOp())
	}
	if batchBytes > maxPushBatchBytes {
		return nil, connect.NewError(connect.CodeResourceExhausted, errors.New("push batch is larger than 1 MiB"))
	}
	// Authorization finishes before the database transaction starts.
	decisions := make([]pushDecision, 0, len(req.Msg.GetOperations()))
	for _, operation := range req.Msg.GetOperations() {
		decision, err := s.preflight(ctx, principal, operation)
		if err != nil {
			return nil, err
		}
		decisions = append(decisions, decision)
	}
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	queries := db.New(tx)
	items := make([]*syncv1.PushAckItem, 0, len(decisions))
	for _, decision := range decisions {
		if decision.early != nil {
			if decision.audit != nil {
				if err := writeAudit(ctx, queries, decision.audit); err != nil {
					return nil, err
				}
			}
			items = append(items, decision.early)
			continue
		}
		item, err := s.persist(ctx, queries, replica, principal, decision.operation)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return connect.NewResponse(&syncv1.PushResponse{Items: items}), nil
}

func acceptPersonal(ctx context.Context, queries *db.Queries, replica uuid.UUID, operation *syncv1.PushOperation) (*syncv1.PushAckItem, error) {
	if operation.GetCollection() != collectionPersonal {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Accepted: false, RejectReason: "official collections are server-authored"}, nil
	}
	if operation.GetScopeId() == "" || operation.GetClientSeq() < 1 {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Accepted: false, RejectReason: "scope_id and client_seq are required"}, nil
	}
	if len(operation.GetOp()) == 0 || len(operation.GetOp()) > maxPersonalOpBytes {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Accepted: false, RejectReason: "op is empty or larger than 8 MiB"}, nil
	}
	existing, err := queries.FindPushReceipt(ctx, db.FindPushReceiptParams{ReplicaID: replica, ClientSeq: operation.GetClientSeq()})
	if err == nil {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: existing, Accepted: true}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	if err := queries.LockSyncScope(ctx, operation.GetCollection()+"|"+operation.GetScopeId()); err != nil {
		return nil, err
	}
	lsn, err := queries.NextLSN(ctx, db.NextLSNParams{Collection: operation.GetCollection(), ScopeID: operation.GetScopeId()})
	if err != nil {
		return nil, err
	}
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if err := queries.InsertSyncLog(ctx, db.InsertSyncLogParams{
		Collection: operation.GetCollection(), ScopeID: operation.GetScopeId(), Lsn: lsn, Op: operation.GetOp(), RecordedAt: now,
	}); err != nil {
		return nil, err
	}
	if err := queries.InsertPushReceipt(ctx, db.InsertPushReceiptParams{
		ReplicaID: replica, ClientSeq: operation.GetClientSeq(), Collection: operation.GetCollection(), ScopeID: operation.GetScopeId(), Lsn: lsn,
	}); err != nil {
		return nil, err
	}
	if err := queries.UpsertLoroDoc(ctx, db.UpsertLoroDocParams{
		DocID: operation.GetScopeId(), LatestSnapshot: operation.GetOp(), SnapshotVersion: lsn, UpdatedAt: now,
	}); err != nil {
		return nil, err
	}
	return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: lsn, Accepted: true}, nil
}
