package main

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/worker"

	"raspos/platform/server/internal/blob"
	"raspos/platform/server/internal/db"
	"raspos/platform/server/internal/hint"
	"raspos/platform/server/internal/ingest"
	"raspos/platform/server/internal/miniapps"
	platformworker "raspos/platform/server/internal/worker"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	temporalAddress := os.Getenv("TEMPORAL_ADDRESS")
	if databaseURL == "" || temporalAddress == "" {
		slog.Error("DATABASE_URL and TEMPORAL_ADDRESS are required")
		os.Exit(1)
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		slog.Error("postgres", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	objects, err := blob.Open(ctx)
	if err != nil {
		slog.Error("blob", "err", err)
		os.Exit(1)
	}
	var publisher hint.Publisher
	if natsURL := os.Getenv("NATS_URL"); natsURL != "" {
		publisher, err = hint.Connect(natsURL)
		if err != nil {
			slog.Error("nats", "err", err)
			os.Exit(1)
		}
	}
	temporalClient := dial(temporalAddress)
	defer temporalClient.Close()
	if err := ensureSchedule(ctx, temporalClient); err != nil {
		slog.Error("schedule", "err", err)
		os.Exit(1)
	}
	service := worker.New(temporalClient, platformworker.TaskQueue, worker.Options{})
	activities := &platformworker.Activities{
		Pool: pool, Sources: ingest.HTTP{}, Objects: objects, Hints: publisher,
		CompactBin: os.Getenv("COMPACT_DOC_BIN"),
	}
	service.RegisterWorkflow(platformworker.IngestSource)
	service.RegisterWorkflow(platformworker.CompactPersonal)
	service.RegisterActivity(activities)
	registerMiniapps(service, pool, objects)
	if err := service.Run(worker.InterruptCh()); err != nil {
		slog.Error("worker", "err", err)
		os.Exit(1)
	}
}

func registerMiniapps(service worker.Worker, pool *pgxpool.Pool, objects blob.Store) {
	raw := os.Getenv("MINIAPP_PUBLISHER_PUBLIC_KEY")
	if raw == "" {
		slog.Info("miniapps", "review", "disabled", "reason", "MINIAPP_PUBLISHER_PUBLIC_KEY is unset")
		return
	}
	key, err := hex.DecodeString(raw)
	if err != nil || len(key) != ed25519.PublicKeySize {
		slog.Error("miniapps", "err", "MINIAPP_PUBLISHER_PUBLIC_KEY must be 32 bytes of hex")
		os.Exit(1)
	}
	review := &miniapps.Activities{
		Registry:  miniapps.Registry{Queries: db.New(pool), Blobs: objects},
		Publisher: ed25519.PublicKey(key),
	}
	service.RegisterWorkflow(miniapps.ReviewMiniapp)
	service.RegisterActivity(review)
}

func dial(address string) client.Client {
	for {
		temporalClient, err := client.Dial(client.Options{HostPort: address})
		if err == nil {
			return temporalClient
		}
		slog.Warn("temporal", "err", err)
		time.Sleep(2 * time.Second)
	}
}

func ensureSchedule(ctx context.Context, temporalClient client.Client) error {
	_, err := temporalClient.ScheduleClient().Create(ctx, client.ScheduleOptions{
		ID: "compact-loro-daily",
		Spec: client.ScheduleSpec{
			CronExpressions: []string{"0 3 * * *"},
		},
		Action: &client.ScheduleWorkflowAction{
			Workflow:  platformworker.CompactPersonal,
			TaskQueue: platformworker.TaskQueue,
		},
	})
	if err == nil {
		return nil
	}
	handle := temporalClient.ScheduleClient().GetHandle(ctx, "compact-loro-daily")
	if _, describeErr := handle.Describe(ctx); describeErr == nil {
		return nil
	}
	return err
}
