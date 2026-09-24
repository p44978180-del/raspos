package main

import (
	"context"
	"flag"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"

	"raspos/platform/server/internal/ingest"
	"raspos/platform/server/internal/schema"
)

func main() {
	data := flag.String("data", "", "path to the public directory that contains data/")
	flag.Parse()
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" || *data == "" {
		slog.Error("DATABASE_URL and -data are required")
		os.Exit(1)
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
	result, err := ingest.Import(ctx, pool, *data)
	if err != nil {
		slog.Error("import", "err", err)
		os.Exit(1)
	}
	slog.Info("imported", "groups", result.Groups, "lessons", result.Lessons)
}
