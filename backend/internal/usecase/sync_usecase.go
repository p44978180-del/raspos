package usecase

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"timacad-backend/internal/domain"
	"timacad-backend/internal/repository/postgres"
	"timacad-backend/internal/repository/redis"
	"timacad-backend/pkg/parser"
)

type SyncUseCase struct {
	pgRepo       *postgres.Repository
	redisRepo    *redis.Repository
	bridge       *parser.Bridge
	mu           sync.RWMutex
	isSyncing    bool
	jobID        string
	lastSyncTime *time.Time
	totalGroups  int
	totalClasses int
	lastStatus   string
	message      string
}

func NewSyncUseCase(pgRepo *postgres.Repository, redisRepo *redis.Repository, bridge *parser.Bridge) *SyncUseCase {
	return &SyncUseCase{
		pgRepo:     pgRepo,
		redisRepo:  redisRepo,
		bridge:     bridge,
		lastStatus: "idle",
		message:    "No synchronization run yet",
	}
}

// TriggerSync starts the background Python parser bridge and PostgreSQL ingestion
func (uc *SyncUseCase) TriggerSync() (*domain.SyncTriggerResponse, error) {
	uc.mu.Lock()
	if uc.isSyncing {
		uc.mu.Unlock()
		return &domain.SyncTriggerResponse{
			Status:  "busy",
			Message: "Synchronization is already in progress",
			JobID:   uc.jobID,
		}, nil
	}

	uc.isSyncing = true
	uc.jobID = fmt.Sprintf("sync-%d", time.Now().Unix())
	uc.lastStatus = "running"
	uc.message = "Synchronization in progress"
	currentJobID := uc.jobID
	uc.mu.Unlock()

	// Launch background worker
	go func(jobID string) {
		log.Printf("[SyncWorker] Starting synchronization job %s...", jobID)
		bgCtx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()

		jsonBytes, err := uc.bridge.Run(bgCtx)
		if err != nil {
			log.Printf("[SyncWorker] Bridge execution error: %v", err)
			uc.mu.Lock()
			uc.isSyncing = false
			uc.lastStatus = "failed"
			uc.message = fmt.Sprintf("Bridge failure: %v", err)
			uc.mu.Unlock()
			return
		}

		groups, classes, err := uc.pgRepo.IngestJSON(bgCtx, jsonBytes)
		if err != nil {
			log.Printf("[SyncWorker] Database ingestion error: %v", err)
			uc.mu.Lock()
			uc.isSyncing = false
			uc.lastStatus = "failed"
			uc.message = fmt.Sprintf("Database ingestion error: %v", err)
			uc.mu.Unlock()
			return
		}

		// Invalidate all Redis schedule caches on completion
		if uc.redisRepo != nil {
			if invErr := uc.redisRepo.InvalidateAll(bgCtx); invErr != nil {
				log.Printf("[SyncWorker] Warning: Redis cache invalidation error: %v", invErr)
			}
		}

		now := time.Now().UTC()
		uc.mu.Lock()
		uc.isSyncing = false
		uc.lastSyncTime = &now
		uc.totalGroups = groups
		uc.totalClasses = classes
		uc.lastStatus = "success"
		uc.message = fmt.Sprintf("Successfully synchronized %d groups and %d classes", groups, classes)
		uc.mu.Unlock()

		log.Printf("[SyncWorker] Job %s successfully finished: %d groups, %d classes", jobID, groups, classes)
	}(currentJobID)

	return &domain.SyncTriggerResponse{
		Status:  "started",
		Message: "Schedule synchronization triggered in background",
		JobID:   currentJobID,
	}, nil
}

// GetStatus returns the current worker pool status
func (uc *SyncUseCase) GetStatus() domain.SyncStatusResponse {
	uc.mu.RLock()
	defer uc.mu.RUnlock()

	return domain.SyncStatusResponse{
		IsSyncing:    uc.isSyncing,
		JobID:        uc.jobID,
		LastSyncTime: uc.lastSyncTime,
		TotalGroups:  uc.totalGroups,
		TotalClasses: uc.totalClasses,
		LastStatus:   uc.lastStatus,
		Message:      uc.message,
	}
}
