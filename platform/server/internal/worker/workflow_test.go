package worker

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.temporal.io/sdk/testsuite"

	"raspos/platform/server/internal/blob"
	"raspos/platform/server/internal/db"
	"raspos/platform/server/internal/hint"
	"raspos/platform/server/internal/ingest"
	"raspos/platform/server/internal/schema"
)

type memoryHints struct {
	items []hint.Hint
}

func (m *memoryHints) Publish(_ context.Context, item hint.Hint) error {
	m.items = append(m.items, item)
	return nil
}

func TestWorkflowParsesEvidenceAndKeepsSnapshotOn500(t *testing.T) {
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
	fixture := readEvidence(t, "sample-group.html")
	mux := http.NewServeMux()
	mux.HandleFunc("/good", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(fixture)
	})
	mux.HandleFunc("/bad", func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "down", http.StatusInternalServerError)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	published := &memoryHints{}
	activities := &Activities{Pool: pool, Sources: ingest.HTTP{}, Objects: &blob.Memory{}, Hints: published}
	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()
	env.RegisterWorkflow(IngestSource)
	env.RegisterActivity(activities)
	env.ExecuteWorkflow(IngestSource, server.URL+"/good")
	if err := env.GetWorkflowError(); err != nil {
		t.Fatal(err)
	}
	var result ingest.Outcome
	if err := env.GetWorkflowResult(&result); err != nil {
		t.Fatal(err)
	}
	if result.Status != "applied" || result.GroupCode != "ДА 01-24" || result.LSN < 1 {
		t.Fatalf("result %+v", result)
	}
	if len(published.items) != 1 || published.items[0].ScopeID != "ДА 01-24" || published.items[0].Collection != ingest.CollectionLesson {
		t.Fatalf("hints %+v", published.items)
	}
	hash, err := db.New(pool).CurrentSnapshotHash(ctx, "ДА 01-24")
	if err != nil {
		t.Fatal(err)
	}
	failed := suite.NewTestWorkflowEnvironment()
	failed.RegisterWorkflow(IngestSource)
	failed.RegisterActivity(activities)
	failed.ExecuteWorkflow(IngestSource, server.URL+"/bad")
	if err := failed.GetWorkflowError(); err == nil {
		t.Fatal("HTTP 500 completed the workflow")
	}
	again, err := db.New(pool).CurrentSnapshotHash(ctx, "ДА 01-24")
	if err != nil {
		t.Fatal(err)
	}
	if again != hash {
		t.Fatalf("snapshot hash changed after HTTP 500: %s -> %s", hash, again)
	}
	lessons, err := db.New(pool).CountLessons(ctx)
	if err != nil || lessons < 2 {
		t.Fatalf("lessons %d err %v", lessons, err)
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
		Port(55433).
		RuntimePath(dir).
		CachePath(cache).
		StartTimeout(2 * time.Minute)
	database := embeddedpostgres.NewDatabase(config)
	if err := database.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = database.Stop() })
	return "postgres://timacad:timacad@127.0.0.1:55433/timacad?sslmode=disable"
}

func readEvidence(t *testing.T, name string) []byte {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		raw, err := os.ReadFile(filepath.Join(dir, "docs", "evidence", name))
		if err == nil {
			return raw
		}
		dir = filepath.Dir(dir)
	}
	t.Fatalf("docs/evidence/%s not found", name)
	return nil
}
