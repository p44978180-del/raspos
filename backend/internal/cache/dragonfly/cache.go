package dragonfly

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

type DragonflyScheduleCache struct {
	client *redis.Client
}

func NewDragonflyScheduleCache(addr string, password string, db int) *DragonflyScheduleCache {
	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		Password:     password,
		DB:           db,
		DialTimeout:  2 * time.Second,
		ReadTimeout:  1 * time.Second,
		WriteTimeout: 1 * time.Second,
		PoolSize:     50,
	})
	return &DragonflyScheduleCache{client: rdb}
}

func (c *DragonflyScheduleCache) FormatKey(groupID int64, semester int, weekParity string) string {
	return fmt.Sprintf("schedule:group:%d:sem:%d:week:%s", groupID, semester, weekParity)
}

// StoreBinarySnapshot caches pre-rendered binary Protobuf snapshot with 24-hour TTL
func (c *DragonflyScheduleCache) StoreBinarySnapshot(ctx context.Context, key string, snapshotBytes []byte) error {
	return c.client.Set(ctx, key, snapshotBytes, 24*time.Hour).Err()
}

// GetBinarySnapshot retrieves binary Protobuf snapshot with sub-millisecond latency
func (c *DragonflyScheduleCache) GetBinarySnapshot(ctx context.Context, key string) ([]byte, error) {
	return c.client.Get(ctx, key).Bytes()
}

// InvalidateGroup prunes cache on schedule change
func (c *DragonflyScheduleCache) InvalidateGroup(ctx context.Context, groupID int64) error {
	pattern := fmt.Sprintf("schedule:group:%d:*", groupID)
	iter := c.client.Scan(ctx, 0, pattern, 0).Iterator()
	for iter.Next(ctx) {
		_ = c.client.Del(ctx, iter.Val()).Err()
	}
	return iter.Err()
}
