package syncsvc

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net"
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
	// Retained immutable history must not inflate the current v4 parity count.
	_, err = pool.Exec(ctx, `WITH historical AS (
		INSERT INTO schedule_snapshot (id, group_id, document_id, parser_version, content_sha256, lesson_count, valid_from, superseded_at)
		SELECT $1, group_id, document_id, parser_version, 'historical-parity-test', lesson_count, valid_from, now()
		FROM schedule_snapshot WHERE lesson_count > 0 LIMIT 1 RETURNING id, group_id
	)
	INSERT INTO lesson (id, snapshot_id, group_id, occurs_on, starts_at, ends_at, subject, kind, teacher, building, room, week_type, source_url)
	SELECT $2, h.id, h.group_id, l.occurs_on, l.starts_at, l.ends_at, l.subject, l.kind, l.teacher, l.building, l.room, l.week_type, l.source_url
	FROM historical h JOIN lesson l ON l.group_id = h.group_id LIMIT 1`, uuid.New(), uuid.New())
	if err != nil {
		t.Fatal(err)
	}
	withHistory, err := ingest.Import(ctx, pool, findPublic(t))
	if err != nil || withHistory.Lessons != 47068 {
		t.Fatalf("history affected parity: %+v, %v", withHistory, err)
	}
	// Returning to a previously imported version must reactivate it, rather
	// than leaving the newer version active because the hash already exists.
	_, err = pool.Exec(ctx, `UPDATE schedule_snapshot SET superseded_at = CASE
		WHEN content_sha256 = 'historical-parity-test' THEN NULL ELSE now() END
		WHERE group_id = (SELECT group_id FROM schedule_snapshot WHERE content_sha256 = 'historical-parity-test')`)
	if err != nil {
		t.Fatal(err)
	}
	reverted, err := ingest.Import(ctx, pool, findPublic(t))
	if err != nil || reverted.Lessons != 47068 {
		t.Fatalf("reverting to v4 failed: %+v, %v", reverted, err)
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
	directory := stream.Msg()
	var directoryOp syncv1.SyncOp
	if directory.GetCollection() != ingest.CollectionDirectory || proto.Unmarshal(directory.GetOp(), &directoryOp) != nil || len(directoryOp.GetDirectory().GetGroups()) != 805 {
		t.Fatal("bootstrap did not begin with the full directory")
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
	if !stream.Receive() {
		t.Fatal("bootstrap omitted campus", stream.Err())
	}
	graph := stream.Msg()
	var graphOp syncv1.SyncOp
	if graph.GetCollection() != ingest.CollectionCampus || graph.GetScopeId() != ingest.ScopeCampus || proto.Unmarshal(graph.GetOp(), &graphOp) != nil || graphOp.GetCampus() == nil {
		t.Fatal("invalid campus frame")
	}
	sum := sha256.Sum256(graphOp.GetCampus().GetPackJson())
	if graphOp.GetCampus().GetSnapshotHash() != hex.EncodeToString(sum[:]) || len(graphOp.GetCampus().GetPackJson()) < 1_000_000 {
		t.Fatal("campus data/hash mismatch")
	}
	if graph.GetLsn() != 1 {
		t.Fatal("reimport duplicated the campus version")
	}
	if directory.GetServerTimeUnixMs() != frame.GetServerTimeUnixMs() || frame.GetServerTimeUnixMs() != graph.GetServerTimeUnixMs() {
		t.Fatal("bundle has inconsistent server times")
	}
	if stream.Receive() {
		t.Fatal("bootstrap sent more than the three snapshots")
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
	defaultStream, err := client.Bootstrap(ctx, connect.NewRequest(&syncv1.BootstrapRequest{ReplicaId: uuid.NewString()}))
	if err != nil {
		t.Fatal(err)
	}
	var defaults []*syncv1.BootstrapResponse
	for defaultStream.Receive() {
		defaults = append(defaults, defaultStream.Msg())
	}
	if defaultStream.Err() != nil || len(defaults) != 3 || defaults[1].GetScopeId() == "" {
		t.Fatal("first-start bootstrap is incomplete", defaultStream.Err())
	}
	if _, err := pool.Exec(ctx, "DELETE FROM sync_log WHERE collection=$1", ingest.CollectionCampus); err != nil {
		t.Fatal(err)
	}
	incomplete, err := client.Bootstrap(ctx, connect.NewRequest(&syncv1.BootstrapRequest{ReplicaId: uuid.NewString(), GroupCode: "Д-А401"}))
	if err == nil {
		if incomplete.Receive() {
			t.Fatal("incomplete bootstrap emitted a successful partial bundle")
		}
		err = incomplete.Err()
	}
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Fatal("incomplete bundle did not return not_found", err)
	}
}

func startPostgres(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	cache := filepath.Join(os.Getenv("USERPROFILE"), ".cache", "raspos-platform", "embedded-postgres")
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	_ = listener.Close()
	config := embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V17).
		Username("timacad").
		Password("timacad").
		Database("timacad").
		Port(uint32(port)).
		RuntimePath(dir).
		CachePath(cache).
		StartTimeout(2 * time.Minute)
	database := embeddedpostgres.NewDatabase(config)
	if err := database.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Stop() })
	return fmt.Sprintf("postgres://timacad:timacad@127.0.0.1:%d/timacad?sslmode=disable", port)
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
