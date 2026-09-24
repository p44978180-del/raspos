package syncsvc

import (
	"context"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"connectrpc.com/connect"
	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/authz"
	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
	"raspos/platform/server/internal/schema"
)

type allowChecker struct{}

func (allowChecker) Check(context.Context, authz.Check) (bool, error) { return true, nil }
func (allowChecker) Write(context.Context, []authz.Tuple) error       { return nil }
func (allowChecker) Delete(context.Context, []authz.Tuple) error      { return nil }

func TestParallelThreadPushKeepsDenseLSNs(t *testing.T) {
	pool := startSocialPostgres(t, 55436)
	ctx := context.Background()
	server := newSocialServer(t, pool, allowChecker{})
	client := syncv1connect.NewSyncServiceClient(server.Client(), server.URL)
	const writers = 10
	tokens := make([]string, writers)
	queries := db.New(pool)
	for i := range tokens {
		tokens[i] = mustSession(t, ctx, queries, insertPrincipal(t, ctx, queries, "Студент"))
	}
	var group sync.WaitGroup
	errs := make(chan error, writers)
	group.Add(writers)
	for i := 0; i < writers; i++ {
		token := tokens[i]
		go func() {
			defer group.Done()
			body, err := proto.Marshal(&syncv1.ThreadOp{Body: &syncv1.ThreadOp_Post{Post: &syncv1.ThreadPost{
				ThreadId: "chat", GroupCode: "DA-401", Body: "сообщение",
			}}})
			if err != nil {
				errs <- err
				return
			}
			request := connect.NewRequest(&syncv1.PushRequest{
				ReplicaId: uuid.Must(uuid.NewV7()).String(),
				Operations: []*syncv1.PushOperation{{
					Collection: collectionThread, ScopeId: "chat", ClientSeq: 1, Op: body,
				}},
			})
			request.Header().Set("Authorization", "Bearer "+token)
			response, err := client.Push(ctx, request)
			if err != nil {
				errs <- err
				return
			}
			if !response.Msg.GetItems()[0].GetAccepted() {
				errs <- errString(response.Msg.GetItems()[0].GetRejectReason())
			}
		}()
	}
	group.Wait()
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	lsns, err := db.New(pool).ListThreadEntryLSNs(ctx, "chat")
	if err != nil {
		t.Fatal(err)
	}
	if len(lsns) != writers {
		t.Fatalf("entries %d", len(lsns))
	}
	for i, lsn := range lsns {
		if lsn != int64(i+1) {
			t.Fatalf("lsns %v", lsns)
		}
	}
}

func TestMemberCannotHideAndHeadCan(t *testing.T) {
	apiURL := startOpenFGA(t)
	pool := startSocialPostgres(t, 55437)
	ctx := context.Background()
	queries := db.New(pool)
	raw := dialOpenFGA(t, ctx, apiURL)
	checker := &authz.CachingChecker{Inner: raw, TTL: 10 * time.Second}
	group := "DA-401"
	threadID := "chat"
	groupHex := ObjectID(group)
	threadHex := ObjectID(threadID)
	head := insertPrincipal(t, ctx, queries, "Староста")
	member := insertPrincipal(t, ctx, queries, "Студент")
	if err := checker.Write(ctx, []authz.Tuple{
		{User: "user:" + head.String(), Relation: "head", Object: "group:" + groupHex},
		{User: "user:" + member.String(), Relation: "member", Object: "group:" + groupHex},
		{User: "group:" + groupHex, Relation: "group", Object: "thread:" + threadHex},
		{User: "group:" + groupHex, Relation: "group", Object: "document:" + groupHex},
	}); err != nil {
		t.Fatal(err)
	}
	server := newSocialServer(t, pool, checker)
	client := syncv1connect.NewSyncServiceClient(server.Client(), server.URL)
	memberToken := mustSession(t, ctx, queries, member)
	post := threadPush(t, ctx, client, memberToken, threadPost(t, threadID, group, "кто дежурит?"))
	if !post.GetAccepted() || post.GetLsn() != 1 {
		t.Fatalf("post %+v", post)
	}
	_, err := client.Push(ctx, threadRequest(t, memberToken, threadHide(t, threadID, post.GetLsn())))
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Fatalf("member hide code %v err %v", connect.CodeOf(err), err)
	}
	headAck := threadPush(t, ctx, client, mustSession(t, ctx, queries, head), threadHide(t, threadID, post.GetLsn()))
	if !headAck.GetAccepted() {
		t.Fatalf("head hide %+v", headAck)
	}
	entry, err := queries.FindThreadEntry(ctx, db.FindThreadEntryParams{ThreadID: threadID, EntryLsn: post.GetLsn()})
	if err != nil || !entry.Hidden {
		t.Fatalf("entry %+v err %v", entry, err)
	}
	duty := connect.NewRequest(&syncv1.PushRequest{
		ReplicaId: uuid.Must(uuid.NewV7()).String(),
		Operations: []*syncv1.PushOperation{{
			Collection: collectionDutyRoster, ScopeId: group, ClientSeq: 1, Op: []byte("duty-anna"),
		}},
	})
	duty.Header().Set("Authorization", "Bearer "+memberToken)
	saved, err := client.Push(ctx, duty)
	if err != nil || !saved.Msg.GetItems()[0].GetAccepted() {
		t.Fatalf("duty %+v err %v", saved, err)
	}
}

func threadPush(t *testing.T, ctx context.Context, client syncv1connect.SyncServiceClient, token string, op []byte) *syncv1.PushAckItem {
	t.Helper()
	response, err := client.Push(ctx, threadRequest(t, token, op))
	if err != nil {
		t.Fatal(err)
	}
	return response.Msg.GetItems()[0]
}

func threadRequest(t *testing.T, token string, op []byte) *connect.Request[syncv1.PushRequest] {
	t.Helper()
	request := connect.NewRequest(&syncv1.PushRequest{
		ReplicaId: uuid.Must(uuid.NewV7()).String(),
		Operations: []*syncv1.PushOperation{{
			Collection: collectionThread, ScopeId: "chat", ClientSeq: 1, Op: op,
		}},
	})
	request.Header().Set("Authorization", "Bearer "+token)
	return request
}

func threadPost(t *testing.T, threadID, group, body string) []byte {
	t.Helper()
	payload, err := proto.Marshal(&syncv1.ThreadOp{Body: &syncv1.ThreadOp_Post{Post: &syncv1.ThreadPost{
		ThreadId: threadID, GroupCode: group, Body: body,
	}}})
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func threadHide(t *testing.T, threadID string, entry int64) []byte {
	t.Helper()
	payload, err := proto.Marshal(&syncv1.ThreadOp{Body: &syncv1.ThreadOp_Hide{Hide: &syncv1.ThreadHide{
		ThreadId: threadID, EntryLsn: entry,
	}}})
	if err != nil {
		t.Fatal(err)
	}
	return payload
}

func newSocialServer(t *testing.T, pool *pgxpool.Pool, checker authz.Checker) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(handlerWithAuth(pool, checker))
	t.Cleanup(server.Close)
	return server
}

type errString string

func (e errString) Error() string { return string(e) }

func startSocialPostgres(t *testing.T, port uint32) *pgxpool.Pool {
	t.Helper()
	dir := t.TempDir()
	cache := filepath.Join(os.Getenv("USERPROFILE"), ".cache", "raspos-platform", "embedded-postgres")
	config := embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V17).
		Username("timacad").
		Password("timacad").
		Database("timacad").
		Port(port).
		RuntimePath(dir).
		CachePath(cache).
		StartTimeout(2 * time.Minute)
	database := embeddedpostgres.NewDatabase(config)
	if err := database.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Stop() })
	url := fmt.Sprintf("postgres://timacad:timacad@127.0.0.1:%d/timacad?sslmode=disable", port)
	if err := schema.Up(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(context.Background(), url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}
