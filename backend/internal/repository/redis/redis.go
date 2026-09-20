package redis

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	DefaultTTL = 86400 * time.Second // 24 hours
)

type Repository struct {
	client *redis.Client
	ttl    time.Duration
}

func New(ctx context.Context, redisURL string) (*Repository, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		// Never reinterpret a malformed credential-bearing URL as a loggable host.
		return nil, fmt.Errorf("invalid Redis connection configuration")
	}

	client := redis.NewClient(opts)

	// Verify connection
	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	if err := client.Ping(pingCtx).Err(); err != nil {
		log.Print("[Redis] Connection unavailable; caching may operate in degraded mode")
	} else {
		log.Println("[Redis] Successfully connected to Redis")
	}

	return &Repository{
		client: client,
		ttl:    DefaultTTL,
	}, nil
}

func (r *Repository) Client() *redis.Client {
	return r.client
}

func (r *Repository) Close() error {
	if r.client != nil {
		return r.client.Close()
	}
	return nil
}

// FormatKey generates key adhering strictly to contract: schedule:group:{group_id}:sem:{semester}:week:{odd|even|all}
func (r *Repository) FormatKey(groupID int, semester int, week string) string {
	w := strings.ToLower(strings.TrimSpace(week))
	if w != "odd" && w != "even" && w != "all" {
		w = "all"
	}
	if semester < 1 {
		semester = 1
	}
	return fmt.Sprintf("schedule:group:%d:sem:%d:week:%s", groupID, semester, w)
}

// GetSchedule returns cached JSON bytes, or nil if cache miss
func (r *Repository) GetSchedule(ctx context.Context, groupID int, semester int, week string) ([]byte, error) {
	if r.client == nil {
		return nil, nil
	}
	key := r.FormatKey(groupID, semester, week)
	val, err := r.client.Get(ctx, key).Bytes()
	if err != nil {
		if err == redis.Nil {
			return nil, nil // Cache miss
		}
		return nil, err
	}
	return val, nil
}

// SetSchedule stores schedule JSON with 86400s (24h) TTL
func (r *Repository) SetSchedule(ctx context.Context, groupID int, semester int, week string, data []byte) error {
	if r.client == nil {
		return nil
	}
	key := r.FormatKey(groupID, semester, week)
	return r.client.Set(ctx, key, data, r.ttl).Err()
}

// InvalidateGroup deletes all cached schedules for a specific group (DEL schedule:group:{group_id}:*)
func (r *Repository) InvalidateGroup(ctx context.Context, groupID int) error {
	if r.client == nil {
		return nil
	}
	pattern := fmt.Sprintf("schedule:group:%d:*", groupID)
	return r.deletePattern(ctx, pattern)
}

// InvalidateAll deletes all cached schedule keys in Redis
func (r *Repository) InvalidateAll(ctx context.Context) error {
	if r.client == nil {
		return nil
	}
	pattern := "schedule:group:*"
	return r.deletePattern(ctx, pattern)
}

func (r *Repository) deletePattern(ctx context.Context, pattern string) error {
	var cursor uint64
	var deletedCount int
	for {
		keys, nextCursor, err := r.client.Scan(ctx, cursor, pattern, 100).Result()
		if err != nil {
			return fmt.Errorf("scan error for pattern %s: %w", pattern, err)
		}
		if len(keys) > 0 {
			if err := r.client.Del(ctx, keys...).Err(); err != nil {
				return fmt.Errorf("del error: %w", err)
			}
			deletedCount += len(keys)
		}
		cursor = nextCursor
		if cursor == 0 {
			break
		}
	}
	log.Printf("[Redis] Invalidated %d keys matching %q", deletedCount, pattern)
	return nil
}
