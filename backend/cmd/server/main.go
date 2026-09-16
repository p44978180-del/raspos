package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"timacad-backend/internal/config"
	deliveryHTTP "timacad-backend/internal/delivery/http"
	"timacad-backend/internal/delivery/realtime"
	"timacad-backend/internal/orchestrator"
	"timacad-backend/internal/repository/postgres"
	"timacad-backend/internal/repository/redis"
	"timacad-backend/internal/usecase"
	"timacad-backend/internal/worker"
	"timacad-backend/pkg/parser"
	"timacad-backend/pkg/storage"
)

func main() {
	log.Println("=== Starting RGAU-MSHA Timiryazev Schedule Backend ===")

	cfg := config.Load()
	log.Printf("[Config] Port: %s", cfg.Port)
	log.Printf("[Config] Database URL: %s", cfg.DatabaseURL)
	log.Printf("[Config] Redis URL: %s", cfg.RedisURL)
	log.Printf("[Config] Auto-seed: %v", cfg.AutoSeed)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 1. Initialize PostgreSQL Repository
	pgRepo, err := postgres.New(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("[Fatal] Failed to connect to PostgreSQL: %v", err)
	}
	defer pgRepo.Close()

	// 2. Run Database Migrations
	if err := pgRepo.RunMigrations(ctx); err != nil {
		log.Fatalf("[Fatal] Migration failure: %v", err)
	}

	// 3. Auto-seed if database is empty
	if cfg.AutoSeed {
		if err := pgRepo.SeedIfEmpty(ctx, cfg.ScheduleDataPath); err != nil {
			log.Printf("[Warning] Auto-seeding encountered an issue: %v", err)
		}
	}

	// 4. Initialize Redis Repository
	redisRepo, err := redis.New(ctx, cfg.RedisURL)
	if err != nil {
		log.Printf("[Warning] Redis initialization warning: %v", err)
	}
	if redisRepo != nil {
		defer redisRepo.Close()
	}

	// 5. Initialize Parser Bridge
	bridge := parser.New(cfg.PythonBin, cfg.ParserScriptPath, cfg.ScheduleDataPath)

	// 6. Initialize Realtime SSE Hub & Snapshot Storage
	sseHub := realtime.NewSSEHub()
	snapshotStore, err := storage.NewSnapshotStorage("./snapshots")
	if err != nil {
		log.Printf("[Warning] Snapshot storage initialization warning: %v", err)
	}

	// 7. Initialize Asynchronous Orchestrator & Worker Pool
	orch := orchestrator.New(redisRepo)
	asyncWorker := worker.NewWorker(1, orch, pgRepo, redisRepo, bridge, snapshotStore, sseHub.Broadcast)
	asyncWorker.Start(ctx)

	// 8. Initialize UseCases
	instituteUC := usecase.NewInstituteUseCase(pgRepo)
	groupUC := usecase.NewGroupUseCase(pgRepo)
	scheduleUC := usecase.NewScheduleUseCase(pgRepo, redisRepo)
	syncUC := usecase.NewSyncUseCase(pgRepo, redisRepo, bridge)

	// 9. Initialize HTTP Delivery & Router
	handler := deliveryHTTP.NewHandler(instituteUC, groupUC, scheduleUC, syncUC, pgRepo, sseHub, orch)
	router := deliveryHTTP.NewRouter(handler)

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}


	// 8. Start HTTP Server in background
	go func() {
		log.Printf("[HTTP] Server listening on http://0.0.0.0:%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[Fatal] Server terminated unexpectedly: %v", err)
		}
	}()

	// 9. Handle Graceful Shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("[Shutdown] Signal received. Commencing graceful shutdown...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("[Shutdown] Server forced to shutdown: %v", err)
	}

	log.Println("=== Timacad Backend Gracefully Stopped ===")
}
