package compact

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"connectrpc.com/connect"
	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"raspos/platform/server/internal/db"
	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
	"raspos/platform/server/internal/schema"
	"raspos/platform/server/internal/syncsvc"
)

func TestCompactDropsHistoryAndPullResets(t *testing.T) {
	databaseURL := startPostgres(t)
	ctx := context.Background()
	if err := schema.Up(databaseURL); err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	fixture := commandOutput(t, filepath.Join(crateDir(t), "target", "debug", "personal-fixture.exe"))
	bin := filepath.Join(crateDir(t), "target", "debug", "compact-doc.exe")
	snapshot, err := Exec(bin, fixture)
	if err != nil {
		t.Fatal(err)
	}
	queries := db.New(pool)
	now := pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	if err := queries.UpsertLoroDoc(ctx, db.UpsertLoroDocParams{
		DocID: "user-1", LatestSnapshot: fixture, SnapshotVersion: 2, UpdatedAt: now,
	}); err != nil {
		t.Fatal(err)
	}
	for _, item := range []struct {
		lsn int64
		op  []byte
	}{{1, []byte("old-update")}, {2, fixture}} {
		if err := queries.InsertSyncLog(ctx, db.InsertSyncLogParams{
			Collection: "personal", ScopeID: "user-1", Lsn: item.lsn, Op: item.op, RecordedAt: now,
		}); err != nil {
			t.Fatal(err)
		}
	}
	done, err := Run(ctx, pool, bin)
	if err != nil || done != 1 {
		t.Fatalf("compacted %d err %v", done, err)
	}
	count, err := queries.CountSyncOps(ctx, db.CountSyncOpsParams{Collection: "personal", ScopeID: "user-1"})
	if err != nil || count != 1 {
		t.Fatalf("sync rows %d err %v", count, err)
	}
	stored, err := queries.GetLoroDoc(ctx, "user-1")
	if err != nil || string(stored.LatestSnapshot) != string(snapshot) {
		t.Fatalf("snapshot mismatch err %v", err)
	}
	mux := http.NewServeMux()
	path, handler := syncv1connect.NewSyncServiceHandler(&syncsvc.Service{Pool: pool, Queries: db.New(pool)})
	mux.Handle(path, handler)
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	client := syncv1connect.NewSyncServiceClient(server.Client(), server.URL)
	stream, err := client.Pull(ctx, connect.NewRequest(&syncv1.PullRequest{
		Collection: "personal", ScopeId: "user-1", SinceLsn: 1,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !stream.Receive() {
		t.Fatal(stream.Err())
	}
	if !stream.Msg().GetSnapshotReset() || string(stream.Msg().GetOp()) != string(snapshot) {
		t.Fatalf("pull lsn %d reset %v", stream.Msg().GetLsn(), stream.Msg().GetSnapshotReset())
	}
	if stream.Receive() {
		t.Fatal("pull returned more than the compacted snapshot")
	}
}

func commandOutput(t *testing.T, bin string) []byte {
	t.Helper()
	output, err := exec.Command(bin).Output()
	if err != nil {
		t.Fatal(err)
	}
	return output
}

func crateDir(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		candidate := filepath.Join(dir, "rust", "timacad-core")
		if _, err := os.Stat(filepath.Join(candidate, "Cargo.toml")); err == nil {
			return candidate
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("timacad-core not found")
	return ""
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
		Port(55435).
		RuntimePath(dir).
		CachePath(cache).
		StartTimeout(2 * time.Minute)
	database := embeddedpostgres.NewDatabase(config)
	if err := database.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Stop() })
	return "postgres://timacad:timacad@127.0.0.1:55435/timacad?sslmode=disable"
}
