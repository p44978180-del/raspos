package syncsvc

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"
	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/protobuf/proto"

	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
	"raspos/platform/server/internal/ingest"
	"raspos/platform/server/internal/schema"
)

func TestImportAndGuestBootstrap(t *testing.T) {
	if testing.Short() {
		t.Skip("imports 805 groups")
	}
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
	result, err := ingest.Import(ctx, pool, findPublic(t))
	if err != nil {
		t.Fatal(err)
	}
	if result.Groups != 805 || result.Lessons != 47068 {
		t.Fatalf("imported %+v", result)
	}
	again, err := ingest.Import(ctx, pool, findPublic(t))
	if err != nil {
		t.Fatal(err)
	}
	if again.Lessons != 47068 {
		t.Fatalf("second import %+v", again)
	}

	mux := http.NewServeMux()
	path, handler := syncv1connect.NewSyncServiceHandler(&Service{Pool: pool, Queries: db.New(pool)})
	mux.Handle(path, handler)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client := syncv1connect.NewSyncServiceClient(server.Client(), server.URL)
	stream, err := client.Bootstrap(ctx, connect.NewRequest(&syncv1.BootstrapRequest{
		ReplicaId: uuid.Must(uuid.NewV7()).String(),
		GroupCode: "Д-А401",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !stream.Receive() {
		t.Fatal(stream.Err())
	}
	frame := stream.Msg()
	if frame.GetCollection() != ingest.CollectionLesson || !frame.GetSnapshotReset() || frame.GetLsn() < 1 {
		t.Fatalf("frame %+v", frame)
	}
	var op syncv1.SyncOp
	if err := proto.Unmarshal(frame.GetOp(), &op); err != nil {
		t.Fatal(err)
	}
	snap := op.GetLessons()
	if snap.GetGroupCode() != "Д-А401" || len(snap.GetLessons()) != 73 {
		t.Fatalf("snapshot %s lessons %d", snap.GetGroupCode(), len(snap.GetLessons()))
	}
	if stream.Receive() {
		t.Fatal("bootstrap sent more than the snapshot")
	}
	if err := stream.Err(); err != nil {
		t.Fatal(err)
	}
	fixture := filepath.Join(findPlatform(t), "testdata", "group-da401.op.bin")
	if err := os.WriteFile(fixture, frame.GetOp(), 0o644); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(findPlatform(t), "testdata", "group-da401.sha256"))
	if err != nil {
		t.Fatal(err)
	}
	if snap.GetSnapshotHash() != string(bytesTrim(raw)) {
		t.Fatalf("hash %s", snap.GetSnapshotHash())
	}
}

func startPostgres(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	cache := filepath.Join(os.Getenv("USERPROFILE"), ".cache", "raspos-platform", "embedded-postgres")
	config := embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V17).
		Username("timacad").
		Password("timacad").
		Database("timacad").
		Port(55432).
		RuntimePath(dir).
		CachePath(cache).
		StartTimeout(2 * time.Minute)
	database := embeddedpostgres.NewDatabase(config)
	if err := database.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Stop() })
	return "postgres://timacad:timacad@127.0.0.1:55432/timacad?sslmode=disable"
}

func findPublic(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		if _, err := os.Stat(filepath.Join(dir, "public", "data", "official-schedule.json")); err == nil {
			return filepath.Join(dir, "public")
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("public data not found")
	return ""
}

func findPlatform(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		if _, err := os.Stat(filepath.Join(dir, "testdata", "group-da401.sha256")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("testdata not found")
	return ""
}

func bytesTrim(b []byte) []byte {
	for len(b) > 0 && (b[len(b)-1] == '\n' || b[len(b)-1] == '\r') {
		b = b[:len(b)-1]
	}
	return b
}
