package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	redisclient "github.com/redis/go-redis/v9"

	"timacad-backend/internal/repository/redis"
)

const (
	StreamScheduleSync = "stream:timacad:sync"
	GroupWorkers       = "group:timacad:workers"
)

type TaskStatus string

const (
	StatusPending   TaskStatus = "pending"
	StatusRunning   TaskStatus = "running"
	StatusCompleted TaskStatus = "completed"
	StatusFailed    TaskStatus = "failed"
	StatusRetrying  TaskStatus = "retrying"
)

type SyncTask struct {
	ID          string     `json:"id"`
	Type        string     `json:"type"` // "full_sync", "institute_sync", "group_sync"
	SourceURL   string     `json:"source_url"`
	Institute   string     `json:"institute,omitempty"`
	Year        string     `json:"year"` // "2026/2027"
	RetriesLeft int        `json:"retries_left"`
	MaxRetries  int        `json:"max_retries"`
	CreatedAt   time.Time  `json:"created_at"`
	Status      TaskStatus `json:"status"`
	ErrorMsg    string     `json:"error_msg,omitempty"`
}

type Orchestrator struct {
	redisRepo *redis.Repository
	memQueue  chan SyncTask
	taskStore map[string]*SyncTask
	mu        sync.RWMutex
}

func New(redisRepo *redis.Repository) *Orchestrator {
	return &Orchestrator{
		redisRepo: redisRepo,
		memQueue:  make(chan SyncTask, 100),
		taskStore: make(map[string]*SyncTask),
	}
}

// EnqueueSyncTask dispatches a parsing task to Redis Streams or buffered memory queue
func (o *Orchestrator) EnqueueSyncTask(ctx context.Context, task SyncTask) (string, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	if task.ID == "" {
		task.ID = fmt.Sprintf("job_%d", time.Now().UnixNano())
	}
	if task.Year == "" {
		task.Year = "2026/2027"
	}
	if task.MaxRetries == 0 {
		task.MaxRetries = 3
	}
	task.RetriesLeft = task.MaxRetries
	task.CreatedAt = time.Now().UTC()
	task.Status = StatusPending

	o.taskStore[task.ID] = &task

	// Try enqueuing to Redis Stream if client available
	if o.redisRepo != nil && o.redisRepo.Client() != nil {
		data, err := json.Marshal(task)
		if err == nil {
			err = o.redisRepo.Client().XAdd(ctx, &redisclient.XAddArgs{
				Stream: StreamScheduleSync,
				Values: map[string]any{
					"payload": string(data),
				},
			}).Err()
			if err == nil {
				log.Printf("[Orchestrator] Enqueued task %s to Redis stream %s", task.ID, StreamScheduleSync)
				return task.ID, nil
			}
		}
	}

	// Fallback to internal concurrent queue
	select {
	case o.memQueue <- task:
		log.Printf("[Orchestrator] Enqueued task %s to in-memory worker queue", task.ID)
		return task.ID, nil
	default:
		return "", fmt.Errorf("task queue is full, unable to enqueue task %s", task.ID)
	}
}

// NextTask retrieves the next job for a worker
func (o *Orchestrator) NextTask(ctx context.Context) (*SyncTask, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case task, ok := <-o.memQueue:
		if !ok {
			return nil, fmt.Errorf("queue closed")
		}
		o.mu.Lock()
		task.Status = StatusRunning
		o.taskStore[task.ID] = &task
		o.mu.Unlock()
		return &task, nil
	}
}

// UpdateTaskStatus records execution progress
func (o *Orchestrator) UpdateTaskStatus(taskID string, status TaskStatus, errMsg string) {
	o.mu.Lock()
	defer o.mu.Unlock()

	if t, exists := o.taskStore[taskID]; exists {
		t.Status = status
		t.ErrorMsg = errMsg
	}
}

func (o *Orchestrator) GetTask(taskID string) (*SyncTask, bool) {
	o.mu.RLock()
	defer o.mu.RUnlock()
	t, ok := o.taskStore[taskID]
	if !ok {
		return nil, false
	}
	copy := *t
	return &copy, true
}
