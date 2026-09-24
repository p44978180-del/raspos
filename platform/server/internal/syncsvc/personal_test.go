package syncsvc

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
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
	server := httptest.NewServer(handler(pool))
	t.Cleanup(server.Close)
	client := syncv1connect.NewSyncServiceClient(server.Client(), server.URL)
	replica := uuid.Must(uuid.NewV7()).String()
	other := uuid.Must(uuid.NewV7()).String()
	first := push(t, ctx, client, replica, 1, []byte("update-a"))
	again := push(t, ctx, client, replica, 1, []byte("update-a-replay"))
	if !again.GetAccepted() || again.GetLsn() != first.GetLsn() {
		t.Fatalf("redelivery ack %+v, first %+v", again, first)
	}
	second := push(t, ctx, client, other, 1, []byte("update-b"))
	if second.GetLsn() == first.GetLsn() {
		t.Fatal("second device reused the first lsn")
	}
	count, err := db.New(pool).CountSyncOps(ctx, db.CountSyncOpsParams{Collection: collectionPersonal, ScopeID: "user-1"})
	if err != nil {
		t.Fatal(err)
	}
	if count != 2 {
		t.Fatalf("sync rows %d", count)
	}
	stream, err := client.Pull(ctx, connect.NewRequest(&syncv1.PullRequest{
		Collection: collectionPersonal, ScopeId: "user-1", SinceLsn: 0,
	}))
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
	stored, err := db.New(pool).GetLoroDoc(ctx, "user-1")
	if err != nil {
		t.Fatal(err)
	}
	if string(stored.LatestSnapshot) != "update-b" || stored.SnapshotVersion != second.GetLsn() {
		t.Fatalf("loro_doc %+v", stored)
	}
}

func handler(pool *pgxpool.Pool) http.Handler {
	mux := http.NewServeMux()
	path, service := syncv1connect.NewSyncServiceHandler(&Service{Pool: pool, Queries: db.New(pool)})
	mux.Handle(path, service)
	return mux
}

func push(t *testing.T, ctx context.Context, client syncv1connect.SyncServiceClient, replica string, seq int64, op []byte) *syncv1.PushAckItem {
	t.Helper()
	response, err := client.Push(ctx, connect.NewRequest(&syncv1.PushRequest{
		ReplicaId: replica,
		Operations: []*syncv1.PushOperation{{
			Collection: collectionPersonal, ScopeId: "user-1", ClientSeq: seq, Op: op,
		}},
	}))
	if err != nil {
		t.Fatal(err)
	}
	items := response.Msg.GetItems()
	if len(items) != 1 || !items[0].GetAccepted() {
		t.Fatalf("push %+v", items)
	}
	return items[0]
}
