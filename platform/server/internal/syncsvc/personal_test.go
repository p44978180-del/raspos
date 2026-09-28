package syncsvc

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
	"raspos/platform/server/internal/identity"
	"raspos/platform/server/internal/schema"
)

func TestPersonalPushRedeliveryAndPull(t *testing.T) {
	url := startPostgres(t)
	ctx := context.Background()
	if err := schema.Up(url); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	mux := http.NewServeMux()
	mux.Handle("/", handler(pool))
	accountHandler, err := identity.New(db.New(pool))
	if err != nil {
		t.Fatal(err)
	}
	accountHandler.Register(mux)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client := syncv1connect.NewSyncServiceClient(server.Client(), server.URL)
	principal := insertPrincipal(t, ctx, db.New(pool), "Personal owner")
	token := mustSession(t, ctx, db.New(pool), principal)
	identityRequest, err := http.NewRequest(http.MethodGet, server.URL+"/auth/session", nil)
	if err != nil {
		t.Fatal(err)
	}
	identityRequest.Header.Set("Authorization", "Bearer "+token)
	identityResponse, err := server.Client().Do(identityRequest)
	if err != nil {
		t.Fatal(err)
	}
	var identityBody struct {
		PrincipalID string `json:"principal_id"`
	}
	if err := json.NewDecoder(identityResponse.Body).Decode(&identityBody); err != nil {
		t.Fatal(err)
	}
	identityResponse.Body.Close()
	if identityResponse.StatusCode != http.StatusOK || identityResponse.Header.Get("Cache-Control") != "no-store" || identityBody.PrincipalID != principal.String() {
		t.Fatal("session identity did not match its owner")
	}
	replica := uuid.Must(uuid.NewV7()).String()
	other := uuid.Must(uuid.NewV7()).String()
	first := push(t, ctx, client, token, principal.String(), replica, 1, []byte("update-a"))
	again := push(t, ctx, client, token, principal.String(), replica, 1, []byte("update-a-replay"))
	if !again.GetAccepted() || again.GetLsn() != first.GetLsn() {
		t.Fatalf("redelivery ack %+v, first %+v", again, first)
	}
	second := push(t, ctx, client, token, principal.String(), other, 1, []byte("update-b"))
	if second.GetLsn() == first.GetLsn() {
		t.Fatal("second device reused the first lsn")
	}
	count, err := db.New(pool).CountSyncOps(ctx, db.CountSyncOpsParams{Collection: collectionPersonal, ScopeID: principal.String()})
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("sync rows %d", count)
	}
	request := connect.NewRequest(&syncv1.PullRequest{
		Collection: collectionPersonal, ScopeId: principal.String(), SinceLsn: 0,
	})
	request.Header().Set("Authorization", "Bearer "+token)
	stream, err := client.Pull(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	var ops [][]byte
	for stream.Receive() {
		ops = append(ops, append([]byte(nil), stream.Msg().GetOp()...))
	}
	if err := stream.Err(); err != nil {
		t.Fatal(err)
	}
	if len(ops) != 2 || string(ops[0]) != "update-a" || string(ops[1]) != "update-b" {
		t.Fatalf("pulled %#v", ops)
	}
	stored, err := db.New(pool).GetLoroDoc(ctx, principal.String())
	if err != nil {
		t.Fatal(err)
	}
	if string(stored.LatestSnapshot) != "update-b" || stored.SnapshotVersion != second.GetLsn() {
		t.Fatalf("loro_doc %+v", stored)
	}
	// A second account has its own scope; an absent session has no personal stream.
	for _, otherToken := range []string{"", mustSession(t, ctx, db.New(pool), insertPrincipal(t, ctx, db.New(pool), "Another owner"))} {
		request := connect.NewRequest(&syncv1.PullRequest{Collection: collectionPersonal, ScopeId: principal.String()})
		if otherToken != "" {
			request.Header().Set("Authorization", "Bearer "+otherToken)
		}
		stream, err := client.Pull(ctx, request)
		if err == nil {
			if stream.Receive() {
				t.Fatal("personal data returned to a different account")
			}
			err = stream.Err()
		}
		if err == nil {
			t.Fatal("personal pull should require the document owner")
		}
		mutation := connect.NewRequest(&syncv1.PushRequest{ReplicaId: uuid.NewString(), Operations: []*syncv1.PushOperation{{Collection: collectionPersonal, ScopeId: principal.String(), ClientSeq: 1, Op: []byte("other-account")}}})
		if otherToken != "" {
			mutation.Header().Set("Authorization", "Bearer "+otherToken)
		}
		response, err := client.Push(ctx, mutation)
		if err != nil {
			t.Fatal(err)
		}
		if response.Msg.Items[0].Accepted {
			t.Fatal("personal write should require the document owner")
		}
	}
}

func handler(pool *pgxpool.Pool) http.Handler {
	mux := http.NewServeMux()
	path, service := syncv1connect.NewSyncServiceHandler(&Service{Pool: pool, Queries: db.New(pool)})
	mux.Handle(path, service)
	return mux
}

func push(t *testing.T, ctx context.Context, client syncv1connect.SyncServiceClient, token, scope, replica string, seq int64, op []byte) *syncv1.PushAckItem {
	t.Helper()
	request := connect.NewRequest(&syncv1.PushRequest{
		ReplicaId: replica,
		Operations: []*syncv1.PushOperation{{
			Collection: collectionPersonal, ScopeId: scope, ClientSeq: seq, Op: op,
		}},
	})
	request.Header().Set("Authorization", "Bearer "+token)
	response, err := client.Push(ctx, request)
	if err != nil {
		t.Fatal(err)
	}
	items := response.Msg.GetItems()
	if len(items) != 1 || !items[0].GetAccepted() {
		t.Fatalf("push %+v", items)
	}
	return items[0]
}
