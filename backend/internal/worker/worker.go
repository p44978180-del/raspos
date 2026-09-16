package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"timacad-backend/internal/diff"
	"timacad-backend/internal/domain"
	"timacad-backend/internal/orchestrator"
	"timacad-backend/internal/repository/postgres"
	"timacad-backend/internal/repository/redis"
	"timacad-backend/pkg/parser"
	"timacad-backend/pkg/storage"
)

type Worker struct {
	id           int
	orch         *orchestrator.Orchestrator
	pgRepo       *postgres.Repository
	redisRepo    *redis.Repository
	bridge       *parser.Bridge
	snapshotStore storage.ObjectStorage
	eventBroadcaster func(event domain.RealtimeScheduleEvent)
}

func NewWorker(
	id int,
	orch *orchestrator.Orchestrator,
	pgRepo *postgres.Repository,
	redisRepo *redis.Repository,
	bridge *parser.Bridge,
	snapshotStore storage.ObjectStorage,
	broadcaster func(event domain.RealtimeScheduleEvent),
) *Worker {
	return &Worker{
		id:               id,
		orch:             orch,
		pgRepo:           pgRepo,
		redisRepo:        redisRepo,
		bridge:           bridge,
		snapshotStore:    snapshotStore,
		eventBroadcaster: broadcaster,
	}
}

// Start launches worker routine listening for pipeline tasks
func (w *Worker) Start(ctx context.Context) {
	log.Printf("[Worker #%d] Starting resilient parsing worker loop...", w.id)
	go func() {
		for {
			select {
			case <-ctx.Done():
				log.Printf("[Worker #%d] Terminating worker loop.", w.id)
				return
			default:
				task, err := w.orch.NextTask(ctx)
				if err != nil {
					if ctx.Err() != nil {
						return
					}
					time.Sleep(500 * time.Millisecond)
					continue
				}

				w.executeTaskWithRetry(ctx, task)
			}
		}
	}()
}

func (w *Worker) executeTaskWithRetry(ctx context.Context, task *orchestrator.SyncTask) {
	log.Printf("[Worker #%d] Processing task %s (Type: %s, Year: %s)...", w.id, task.ID, task.Type, task.Year)

	var lastErr error
	for attempt := 1; attempt <= task.MaxRetries; attempt++ {
		err := w.process(ctx, task)
		if err == nil {
			w.orch.UpdateTaskStatus(task.ID, orchestrator.StatusCompleted, "")
			log.Printf("[Worker #%d] Task %s completed successfully!", w.id, task.ID)

			if w.eventBroadcaster != nil {
				w.eventBroadcaster(domain.RealtimeScheduleEvent{
					EventID:     fmt.Sprintf("evt_%d", time.Now().UnixNano()),
					EventType:   "SYNC_COMPLETED",
					GroupID:     0,
					PayloadJSON: fmt.Sprintf(`{"task_id":"%s","status":"completed"}`, task.ID),
					Timestamp:   time.Now().UTC().Format(time.RFC3339),
				})
			}
			return
		}

		lastErr = err
		log.Printf("[Worker #%d] Attempt %d/%d failed for task %s: %v", w.id, attempt, task.MaxRetries, task.ID, err)
		w.orch.UpdateTaskStatus(task.ID, orchestrator.StatusRetrying, err.Error())
		time.Sleep(time.Duration(attempt) * time.Second)
	}

	w.orch.UpdateTaskStatus(task.ID, orchestrator.StatusFailed, lastErr.Error())
	log.Printf("[Worker #%d] Task %s failed after %d attempts: %v", w.id, task.ID, task.MaxRetries, lastErr)
}

func (w *Worker) process(ctx context.Context, task *orchestrator.SyncTask) error {
	dataPath := "public/data/official-schedule.json"
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		dataPath = "../public/data/official-schedule.json"
	}

	// 1. Read existing schedule data from disk/cache
	var currentGroups map[string]domain.ScheduleResponse
	if data, err := os.ReadFile(dataPath); err == nil {
		var root struct {
			Groups map[string]domain.ScheduleResponse `json:"groups"`
		}
		if json.Unmarshal(data, &root) == nil && root.Groups != nil {
			currentGroups = root.Groups
		}

		// 2. Persist immutable snapshot to S3/MinIO
		if w.snapshotStore != nil {
			sourceURL := task.SourceURL
			if sourceURL == "" {
				sourceURL = "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia"
			}
			_, _ = w.snapshotStore.PutSnapshot(ctx, sourceURL, "json", data)
		}
	}

	// 3. Run bridge parser or sync logic
	if w.bridge != nil {
		_, err := w.bridge.RunSync(ctx)
		if err != nil {
			log.Printf("[Worker #%d] Bridge parser warning (using existing schedule): %v", w.id, err)
		}
	}

	// 4. Compute structural diff between old and fresh data
	var freshGroups map[string]domain.ScheduleResponse
	if freshData, err := os.ReadFile(dataPath); err == nil {
		var root struct {
			Groups map[string]domain.ScheduleResponse `json:"groups"`
		}
		if json.Unmarshal(freshData, &root) == nil && root.Groups != nil {
			freshGroups = root.Groups
		}
	}

	if currentGroups != nil && freshGroups != nil {
		diffRes := diff.CompareSnapshots(currentGroups, freshGroups, nil)
		log.Printf("[Worker #%d] Diff analysis complete: HasChanges=%v, ChangedGroups=%d", w.id, diffRes.HasChanges, len(diffRes.ChangedGroupNames))

		// 5. Selectively invalidate Redis cache ONLY for groups with detected structural deltas!
		if w.redisRepo != nil {
			for _, groupName := range diffRes.ChangedGroupNames {
				log.Printf("[Worker #%d] Selectively invalidating Redis cache for group '%s' (delta applied)", w.id, groupName)
				_ = w.redisRepo.InvalidateGroupSchedule(ctx, groupName)
			}
		}
	}

	return nil
}
