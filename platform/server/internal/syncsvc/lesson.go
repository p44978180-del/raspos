package syncsvc

import (
	"context"
	"encoding/hex"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/authz"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
)

const collectionLessonChange = "lesson_change"
const collectionProjection = "authz_projection"

type auditEvent struct {
	principal uuid.UUID
	action    string
	objectID  string
	allowed   bool
}

type pushDecision struct {
	operation *syncv1.PushOperation
	early     *syncv1.PushAckItem
	audit     *auditEvent
}

func (s *Service) preflight(ctx context.Context, principal uuid.UUID, operation *syncv1.PushOperation) (pushDecision, error) {
	switch operation.GetCollection() {
	case collectionPersonal:
		if operation.GetScopeId() == "" || operation.GetClientSeq() < 1 || len(operation.GetOp()) == 0 || len(operation.GetOp()) > maxPersonalOpBytes {
			return pushDecision{early: reject(operation, "personal op is invalid")}, nil
		}
		return pushDecision{operation: operation}, nil
	case collectionLessonChange:
		return s.preflightLessonChange(ctx, principal, operation)
	case collectionGroupBoard, collectionDutyRoster:
		return s.preflightGroupDoc(ctx, principal, operation)
	case collectionThread:
		return s.preflightThread(ctx, principal, operation)
	default:
		return pushDecision{early: reject(operation, "official collections are server-authored")}, nil
	}
}

func (s *Service) preflightLessonChange(ctx context.Context, principal uuid.UUID, operation *syncv1.PushOperation) (pushDecision, error) {
	if principal == uuid.Nil {
		return pushDecision{early: reject(operation, "session required")}, nil
	}
	if s.Authz == nil {
		return pushDecision{early: reject(operation, "authorization is not configured")}, nil
	}
	var change syncv1.LessonChange
	if err := proto.Unmarshal(operation.GetOp(), &change); err != nil || change.GetGroupCode() == "" || change.GetGroupCode() != operation.GetScopeId() {
		return pushDecision{early: reject(operation, "lesson change is invalid")}, nil
	}
	if change.GetKind() != "cancel" && change.GetKind() != "move" && change.GetKind() != "room" {
		return pushDecision{early: reject(operation, "lesson change kind is unknown")}, nil
	}
	if change.GetLessonFingerprint() == "" {
		return pushDecision{early: reject(operation, "lesson fingerprint is required")}, nil
	}
	objectID := ObjectID(change.GetGroupCode())
	allowed, err := s.Authz.Check(ctx, authz.Check{
		UserID: principal.String(), Relation: "can_publish", ObjectType: "lesson_change", ObjectID: objectID,
	})
	if err != nil {
		return pushDecision{}, err
	}
	event := &auditEvent{principal: principal, action: "lesson_change.publish", objectID: change.GetGroupCode(), allowed: allowed}
	if !allowed {
		return pushDecision{early: reject(operation, "publisher is not an editor of the group"), audit: event}, nil
	}
	return pushDecision{operation: operation, audit: event}, nil
}

func (s *Service) persist(ctx context.Context, queries *db.Queries, replica, principal uuid.UUID, operation *syncv1.PushOperation) (*syncv1.PushAckItem, error) {
	switch operation.GetCollection() {
	case collectionLessonChange:
		return acceptLessonChange(ctx, queries, replica, principal, operation)
	case collectionGroupBoard, collectionDutyRoster:
		return acceptGroupDoc(ctx, queries, replica, operation)
	case collectionThread:
		return acceptThread(ctx, queries, replica, principal, operation)
	default:
		return acceptPersonal(ctx, queries, replica, operation)
	}
}

func acceptLessonChange(ctx context.Context, queries *db.Queries, replica, principal uuid.UUID, operation *syncv1.PushOperation) (*syncv1.PushAckItem, error) {
	existing, err := queries.FindPushReceipt(ctx, db.FindPushReceiptParams{ReplicaID: replica, ClientSeq: operation.GetClientSeq()})
	if err == nil {
		return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: existing, Accepted: true}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	var change syncv1.LessonChange
	if err := proto.Unmarshal(operation.GetOp(), &change); err != nil {
		return nil, err
	}
	if err := queries.LockSyncScope(ctx, collectionLessonChange+"|"+operation.GetScopeId()); err != nil {
		return nil, err
	}
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	lsn, err := queries.NextLSN(ctx, db.NextLSNParams{Collection: collectionLessonChange, ScopeID: operation.GetScopeId()})
	if err != nil {
		return nil, err
	}
	if err := queries.InsertSyncLog(ctx, db.InsertSyncLogParams{
		Collection: collectionLessonChange, ScopeID: operation.GetScopeId(), Lsn: lsn, Op: operation.GetOp(), RecordedAt: now,
	}); err != nil {
		return nil, err
	}
	if err := queries.InsertLessonChange(ctx, db.InsertLessonChangeParams{
		ID: uuid.Must(uuid.NewV7()), GroupCode: change.GetGroupCode(), AuthorID: principal, Kind: change.GetKind(),
		Payload: []byte(change.GetPayloadJson()), RecordedAt: now,
	}); err != nil {
		return nil, err
	}
	if err := queries.InsertPushReceipt(ctx, db.InsertPushReceiptParams{
		ReplicaID: replica, ClientSeq: operation.GetClientSeq(), Collection: collectionLessonChange, ScopeID: operation.GetScopeId(), Lsn: lsn,
	}); err != nil {
		return nil, err
	}
	if err := writeAudit(ctx, queries, &auditEvent{principal: principal, action: "lesson_change.publish", objectID: change.GetGroupCode(), allowed: true}); err != nil {
		return nil, err
	}
	projection, err := proto.Marshal(&syncv1.AuthzProjection{
		PrincipalId: principal.String(),
		Grants: []*syncv1.AuthzGrant{{
			ObjectType: "lesson_change", ObjectId: ObjectID(change.GetGroupCode()), Relation: "can_publish",
		}},
	})
	if err != nil {
		return nil, err
	}
	projectionLSN, err := queries.NextLSN(ctx, db.NextLSNParams{Collection: collectionProjection, ScopeID: principal.String()})
	if err != nil {
		return nil, err
	}
	if err := queries.InsertSyncLog(ctx, db.InsertSyncLogParams{
		Collection: collectionProjection, ScopeID: principal.String(), Lsn: projectionLSN, Op: projection, RecordedAt: now,
	}); err != nil {
		return nil, err
	}
	return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Lsn: lsn, Accepted: true}, nil
}

func writeAudit(ctx context.Context, queries *db.Queries, event *auditEvent) error {
	return queries.InsertAudit(ctx, db.InsertAuditParams{
		ID: uuid.Must(uuid.NewV7()), PrincipalID: pgtype.UUID{Bytes: [16]byte(event.principal), Valid: true}, Action: event.action,
		ObjectType: "group", ObjectID: event.objectID, Allowed: event.allowed,
		RecordedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
}

func reject(operation *syncv1.PushOperation, reason string) *syncv1.PushAckItem {
	return &syncv1.PushAckItem{ClientSeq: operation.GetClientSeq(), Accepted: false, RejectReason: reason}
}

func ObjectID(groupCode string) string {
	return hex.EncodeToString([]byte(groupCode))
}
