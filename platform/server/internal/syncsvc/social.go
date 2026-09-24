package syncsvc

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/authz"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
)

const (
	collectionGroupBoard = "group_board"
	collectionDutyRoster = "duty_roster"
	collectionThread     = "thread_entry"
	maxLoroUpdateBytes   = 256 * 1024
	maxDocumentBytes     = 8 * 1024 * 1024
	maxThreadBodyBytes   = 8 * 1024
	maxPushBatchBytes    = 1 * 1024 * 1024
)

func (s *Service) preflightGroupDoc(ctx context.Context, principal uuid.UUID, operation *syncv1.PushOperation) (pushDecision, error) {
	if principal == uuid.Nil {
		return pushDecision{early: reject(operation, "session required")}, nil
	}
	if s.Authz == nil {
		return pushDecision{early: reject(operation, "authorization is not configured")}, nil
	}
	if operation.GetScopeId() == "" || operation.GetClientSeq() < 1 || len(operation.GetOp()) == 0 || len(operation.GetOp()) > maxLoroUpdateBytes {
		return pushDecision{early: reject(operation, "group document update is invalid")}, nil
	}
	return s.allow(ctx, principal, operation, "can_edit", "document", ObjectID(operation.GetScopeId()), "group_document.edit")
}

func (s *Service) preflightThread(ctx context.Context, principal uuid.UUID, operation *syncv1.PushOperation) (pushDecision, error) {
	if principal == uuid.Nil {
		return pushDecision{early: reject(operation, "session required")}, nil
	}
	if s.Authz == nil {
		return pushDecision{early: reject(operation, "authorization is not configured")}, nil
	}
	var thread syncv1.ThreadOp
	if err := proto.Unmarshal(operation.GetOp(), &thread); err != nil {
		return pushDecision{early: reject(operation, "thread op is invalid")}, nil
	}
	switch body := thread.GetBody().(type) {
	case *syncv1.ThreadOp_Post:
		post := body.Post
		if post.GetThreadId() == "" || post.GetThreadId() != operation.GetScopeId() || post.GetGroupCode() == "" {
			return pushDecision{early: reject(operation, "thread post is invalid")}, nil
		}
		if len(post.GetBody()) == 0 || len(post.GetBody()) > maxThreadBodyBytes {
			return pushDecision{early: reject(operation, "thread body is empty or larger than 8 KiB")}, nil
		}
		return s.allow(ctx, principal, operation, "can_post", "thread", ObjectID(post.GetThreadId()), "thread.post")
	case *syncv1.ThreadOp_Hide:
		hide := body.Hide
		if hide.GetThreadId() == "" || hide.GetThreadId() != operation.GetScopeId() || hide.GetEntryLsn() < 1 {
			return pushDecision{early: reject(operation, "thread hide is invalid")}, nil
		}
		decision, err := s.allow(ctx, principal, operation, "can_hide", "thread", ObjectID(hide.GetThreadId()), "thread.hide")
		if err != nil {
			return decision, err
		}
		if decision.early != nil {
			return pushDecision{}, connect.NewError(connect.CodePermissionDenied, errors.New("thread entry cannot be hidden"))
		}
		return decision, nil
	default:
		return pushDecision{early: reject(operation, "thread op is empty")}, nil
	}
}

func (s *Service) allow(ctx context.Context, principal uuid.UUID, operation *syncv1.PushOperation, relation, objectType, objectID, action string) (pushDecision, error) {
	allowed, err := s.Authz.Check(ctx, authz.Check{
		UserID: principal.String(), Relation: relation, ObjectType: objectType, ObjectID: objectID,
	})
	if err != nil {
		return pushDecision{}, err
	}
	event := &auditEvent{principal: principal, action: action, objectID: operation.GetScopeId(), allowed: allowed}
	if !allowed {
		if err := writeAudit(ctx, s.Queries, event); err != nil {
			return pushDecision{}, err
		}
		return pushDecision{early: reject(operation, "permission denied"), audit: nil}, nil
	}
	return pushDecision{operation: operation, audit: event}, nil
}

func acceptGroupDoc(ctx context.Context, queries *db.Queries, replica uuid.UUID, operation *syncv1.PushOperation) (*syncv1.PushAckItem, error) {
	lsn, created, err := assignLog(ctx, queries, replica, operation, operation.GetOp(), true)
	if err != nil {
		return nil, err
	}
	if !created {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: lsn, Accepted: true}, nil
	}
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if err := queries.UpsertLoroDoc(ctx, db.UpsertLoroDocParams{
		DocID: operation.GetCollection() + "/" + operation.GetScopeId(), LatestSnapshot: operation.GetOp(), SnapshotVersion: lsn, UpdatedAt: now,
	}); err != nil {
		return nil, err
	}
	return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: lsn, Accepted: true}, nil
}

func acceptThread(ctx context.Context, queries *db.Queries, replica, principal uuid.UUID, operation *syncv1.PushOperation) (*syncv1.PushAckItem, error) {
	var thread syncv1.ThreadOp
	if err := proto.Unmarshal(operation.GetOp(), &thread); err != nil {
		return nil, err
	}
	if hide := thread.GetHide(); hide != nil {
		return acceptHide(ctx, queries, replica, principal, operation, hide)
	}
	post := thread.GetPost()
	if err := queries.InsertThread(ctx, db.InsertThreadParams{
		ID: post.GetThreadId(), GroupCode: post.GetGroupCode(), CreatedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}); err != nil {
		return nil, err
	}
	existingGroup, err := queries.FindThreadGroup(ctx, post.GetThreadId())
	if err != nil {
		return nil, err
	}
	if existingGroup != post.GetGroupCode() {
		return reject(operation, "thread belongs to another group"), nil
	}
	lsn, created, err := assignLog(ctx, queries, replica, operation, operation.GetOp(), false)
	if err != nil {
		return nil, err
	}
	if created {
		if err := queries.InsertThreadEntry(ctx, db.InsertThreadEntryParams{
			ThreadID: post.GetThreadId(), EntryLsn: lsn, AuthorID: principal, Body: post.GetBody(),
		}); err != nil {
			return nil, err
		}
	}
	return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: lsn, Accepted: true}, nil
}

func acceptHide(ctx context.Context, queries *db.Queries, replica, principal uuid.UUID, operation *syncv1.PushOperation, hide *syncv1.ThreadHide) (*syncv1.PushAckItem, error) {
	entry, err := queries.FindThreadEntry(ctx, db.FindThreadEntryParams{ThreadID: hide.GetThreadId(), EntryLsn: hide.GetEntryLsn()})
	if errors.Is(err, pgx.ErrNoRows) {
		return reject(operation, "thread entry does not exist"), nil
	}
	if err != nil {
		return nil, err
	}
	if entry.Hidden {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: hide.GetEntryLsn(), Accepted: true}, nil
	}
	hidden, err := queries.HideThreadEntry(ctx, db.HideThreadEntryParams{
		ThreadID: hide.GetThreadId(), EntryLsn: hide.GetEntryLsn(),
		HiddenAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		HiddenBy: pgtype.UUID{Bytes: [16]byte(principal), Valid: true},
	})
	if err != nil {
		return nil, err
	}
	if hidden == 0 {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: hide.GetEntryLsn(), Accepted: true}, nil
	}
	lsn, _, err := assignLog(ctx, queries, replica, operation, operation.GetOp(), false)
	if err != nil {
		return nil, err
	}
	return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: lsn, Accepted: true}, nil
}

func assignLog(ctx context.Context, queries *db.Queries, replica uuid.UUID, operation *syncv1.PushOperation, op []byte, quota bool) (int64, bool, error) {
	existing, err := queries.FindPushReceipt(ctx, db.FindPushReceiptParams{ReplicaID: replica, ClientSeq: operation.GetClientSeq()})
	if err == nil {
		return existing, false, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, false, err
	}
	if err := queries.LockSyncScope(ctx, operation.GetCollection()+"|"+operation.GetScopeId()); err != nil {
		return 0, false, err
	}
	if quota {
		used, err := queries.SyncScopeBytes(ctx, db.SyncScopeBytesParams{Collection: operation.GetCollection(), ScopeID: operation.GetScopeId()})
		if err != nil {
			return 0, false, err
		}
		if used+int64(len(op)) > maxDocumentBytes {
			return 0, false, connect.NewError(connect.CodeResourceExhausted, errors.New("group document is larger than 8 MiB"))
		}
	}
	lsn, err := queries.NextLSN(ctx, db.NextLSNParams{Collection: operation.GetCollection(), ScopeID: operation.GetScopeId()})
	if err != nil {
		return 0, false, err
	}
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if err := queries.InsertSyncLog(ctx, db.InsertSyncLogParams{
		Collection: operation.GetCollection(), ScopeID: operation.GetScopeId(), Lsn: lsn, Op: op, RecordedAt: now,
	}); err != nil {
		return 0, false, err
	}
	if err := queries.InsertPushReceipt(ctx, db.InsertPushReceiptParams{
		ReplicaID: replica, ClientSeq: operation.GetClientSeq(), Collection: operation.GetCollection(), ScopeID: operation.GetScopeId(), Lsn: lsn,
	}); err != nil {
		return 0, false, err
	}
	return lsn, true, nil
}
