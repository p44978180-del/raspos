package authz

import (
	"context"
	"sync/atomic"
	"testing"
	"time"
)

type countingChecker struct {
	allow bool
	calls atomic.Int32
}

func (c *countingChecker) Check(context.Context, Check) (bool, error) {
	c.calls.Add(1)
	return c.allow, nil
}

func (c *countingChecker) Write(context.Context, []Tuple) error  { return nil }
func (c *countingChecker) Delete(context.Context, []Tuple) error { return nil }

func TestBatchUsesOneNetworkCheckPerObject(t *testing.T) {
	inner := &countingChecker{allow: true}
	now := time.Unix(1_700_000_000, 0)
	cache := &CachingChecker{Inner: inner, TTL: 10 * time.Second, Now: func() time.Time { return now }}
	check := Check{UserID: "user-1", Relation: "can_publish", ObjectType: "lesson_change", ObjectID: "group-a"}
	for range 50 {
		ok, err := cache.Check(context.Background(), check)
		if err != nil || !ok {
			t.Fatalf("check ok=%v err=%v", ok, err)
		}
	}
	other := check
	other.ObjectID = "group-b"
	if _, err := cache.Check(context.Background(), other); err != nil {
		t.Fatal(err)
	}
	if inner.calls.Load() != 2 {
		t.Fatalf("network checks = %d, want one per object", inner.calls.Load())
	}
	now = now.Add(11 * time.Second)
	if _, err := cache.Check(context.Background(), check); err != nil {
		t.Fatal(err)
	}
	if inner.calls.Load() != 3 {
		t.Fatalf("expired check did not reach OpenFGA, calls=%d", inner.calls.Load())
	}
}

func TestTupleWriteDropsCachedGrant(t *testing.T) {
	inner := &countingChecker{allow: true}
	cache := &CachingChecker{Inner: inner, TTL: 10 * time.Second}
	check := Check{UserID: "user-1", Relation: "can_publish", ObjectType: "lesson_change", ObjectID: "group-a"}
	if _, err := cache.Check(context.Background(), check); err != nil {
		t.Fatal(err)
	}
	if err := cache.Delete(context.Background(), []Tuple{{User: "user:user-1", Relation: "head", Object: "lesson_change:group-a"}}); err != nil {
		t.Fatal(err)
	}
	if _, err := cache.Check(context.Background(), check); err != nil {
		t.Fatal(err)
	}
	if inner.calls.Load() != 2 {
		t.Fatalf("cached grant survived a tuple delete, calls=%d", inner.calls.Load())
	}
}
