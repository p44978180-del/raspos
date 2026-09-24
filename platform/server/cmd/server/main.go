package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"go.temporal.io/sdk/client"

	"raspos/platform/server/internal/authz"
	"raspos/platform/server/internal/db"
	miniappsv1connect "raspos/platform/server/internal/gen/timacad/miniapps/v1/miniappsv1connect"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
	"raspos/platform/server/internal/identity"
	"raspos/platform/server/internal/ingest"
	"raspos/platform/server/internal/miniapps"
	"raspos/platform/server/internal/schema"
	"raspos/platform/server/internal/syncsvc"
	platformworker "raspos/platform/server/internal/worker"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		slog.Error("DATABASE_URL is required")
		os.Exit(1)
	}
	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = "127.0.0.1:8080"
	}
	ctx := context.Background()
	if err := schema.Up(databaseURL); err != nil {
		slog.Error("migration", "err", err)
		os.Exit(1)
	}
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		slog.Error("postgres", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	queries := db.New(pool)
	service := &syncsvc.Service{Pool: pool, Queries: queries}
	if apiURL := os.Getenv("OPENFGA_API_URL"); apiURL != "" {
		openfga, storeID, modelID, err := connectOpenFGA(ctx, apiURL)
		if err != nil {
			slog.Error("openfga", "err", err)
			os.Exit(1)
		}
		slog.Info("openfga", "store_id", storeID, "model_id", modelID)
		service.Authz = &authz.CachingChecker{Inner: openfga, TTL: authz.DefaultTTL}
	}
	passkeys, err := identity.New(queries)
	if err != nil {
		slog.Error("webauthn", "err", err)
		os.Exit(1)
	}
	path, handler := syncv1connect.NewSyncServiceHandler(service)
	mux := http.NewServeMux()
	mux.Handle(path, handler)
	miniPath, miniHandler := miniappsv1connect.NewMiniappServiceHandler(&miniapps.Service{
		Registry: miniapps.Registry{Queries: queries},
	})
	mux.Handle(miniPath, miniHandler)
	passkeys.Register(mux)
	if token := os.Getenv("INGEST_TOKEN"); token != "" {
		workflows := &temporalBox{}
		if address := os.Getenv("TEMPORAL_ADDRESS"); address != "" {
			go workflows.dial(address)
		}
		mux.HandleFunc("POST /ingest", ingest.Trigger(token, func(r *http.Request, pageURL string) (ingest.Outcome, error) {
			temporalClient := workflows.get()
			if temporalClient == nil {
				return ingest.Outcome{}, errUnavailable
			}
			run, err := temporalClient.ExecuteWorkflow(r.Context(), client.StartWorkflowOptions{
				ID: "ingest-" + uuid.Must(uuid.NewV7()).String(), TaskQueue: platformworker.TaskQueue,
			}, platformworker.IngestSource, pageURL)
			if err != nil {
				return ingest.Outcome{}, err
			}
			var result ingest.Outcome
			err = run.Get(r.Context(), &result)
			return result, err
		}))
	}
	if dir := os.Getenv("FIXTURE_DIR"); dir != "" {
		mux.Handle("/fixtures/", http.StripPrefix("/fixtures/", http.FileServer(http.Dir(dir))))
	}
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	slog.Info("listen", "addr", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		slog.Error("http", "err", err)
		os.Exit(1)
	}
}

var errUnavailable = errString("temporal is not connected")

type errString string

func (e errString) Error() string { return string(e) }

func connectOpenFGA(ctx context.Context, apiURL string) (*authz.OpenFGA, string, string, error) {
	deadline := time.Now().Add(2 * time.Minute)
	var last error
	for {
		client, storeID, modelID, err := authz.Ensure(ctx, apiURL, os.Getenv("OPENFGA_STORE_ID"), os.Getenv("OPENFGA_MODEL_ID"))
		if err == nil {
			return client, storeID, modelID, nil
		}
		last = err
		if time.Now().After(deadline) {
			return nil, "", "", last
		}
		slog.Warn("openfga", "err", err)
		time.Sleep(2 * time.Second)
	}
}

type temporalBox struct {
	mu     sync.Mutex
	client client.Client
}

func (b *temporalBox) get() client.Client {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.client
}

func (b *temporalBox) dial(address string) {
	for {
		temporalClient, err := client.Dial(client.Options{HostPort: address})
		if err == nil {
			b.mu.Lock()
			b.client = temporalClient
			b.mu.Unlock()
			slog.Info("temporal", "address", address)
			return
		}
		slog.Warn("temporal", "err", err)
		time.Sleep(2 * time.Second)
	}
}
