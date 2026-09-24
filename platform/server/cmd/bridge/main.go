package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"

	"raspos/platform/server/internal/bridge"
)

func main() {
	natsURL := os.Getenv("NATS_URL")
	apiURL := os.Getenv("CENTRIFUGO_API_URL")
	apiKey := os.Getenv("CENTRIFUGO_HTTP_API_KEY")
	if natsURL == "" || apiURL == "" || apiKey == "" {
		slog.Error("NATS_URL, CENTRIFUGO_API_URL and CENTRIFUGO_HTTP_API_KEY are required")
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	if err := bridge.Run(ctx, natsURL, apiURL, apiKey); err != nil && ctx.Err() == nil {
		slog.Error("bridge", "err", err)
		os.Exit(1)
	}
}
