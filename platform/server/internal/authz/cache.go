package authz

import (
	"context"
	"strings"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

const DefaultTTL = 10 * time.Second

type Check struct {
	UserID     string
	Relation   string
	ObjectType string
	ObjectID   string
}

type Tuple struct {
	User     string
	Relation string
	Object   string
}

// Checker is the OpenFGA boundary. Implementations perform network calls.
type Checker interface {
	Check(ctx context.Context, check Check) (bool, error)
	Write(ctx context.Context, tuples []Tuple) error
	Delete(ctx context.Context, tuples []Tuple) error
}

type decision struct {
	allow   bool
	expires time.Time
}

// CachingChecker deduplicates checks for the same user and object.
// A repeated check inside the TTL does not call OpenFGA again.
// Write and Delete drop cached decisions for the objects they change.
type CachingChecker struct {
	Inner Checker
	TTL   time.Duration
	Now   func() time.Time

	mu    sync.Mutex
	items map[string]decision
	group singleflight.Group
}

func (c *CachingChecker) Check(ctx context.Context, check Check) (bool, error) {
	key := check.UserID + "\x00" + check.Relation + "\x00" + check.ObjectType + "\x00" + check.ObjectID
	if allow, ok := c.fresh(key); ok {
		return allow, nil
	}
	value, err, _ := c.group.Do(key, func() (any, error) {
		if allow, ok := c.fresh(key); ok {
			return allow, nil
		}
		allow, err := c.Inner.Check(ctx, check)
		if err != nil {
			return false, err
		}
		c.remember(key, allow)
		return allow, nil
	})
	if err != nil {
		return false, err
	}
	return value.(bool), nil
}

func (c *CachingChecker) Write(ctx context.Context, tuples []Tuple) error {
	if err := c.Inner.Write(ctx, tuples); err != nil {
		return err
	}
	c.forget(tuples)
	return nil
}

func (c *CachingChecker) Delete(ctx context.Context, tuples []Tuple) error {
	if err := c.Inner.Delete(ctx, tuples); err != nil {
		return err
	}
	c.forget(tuples)
	return nil
}

func (c *CachingChecker) fresh(key string) (bool, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	item, ok := c.items[key]
	if !ok || !c.now().Before(item.expires) {
		return false, false
	}
	return item.allow, true
}

func (c *CachingChecker) remember(key string, allow bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.items == nil {
		c.items = map[string]decision{}
	}
	c.items[key] = decision{allow: allow, expires: c.now().Add(c.ttl())}
}

func (c *CachingChecker) forget(tuples []Tuple) {
	c.mu.Lock()
	defer c.mu.Unlock()
	for key := range c.items {
		for _, tuple := range tuples {
			id := tuple.Object
			if cut := strings.LastIndex(id, ":"); cut >= 0 {
				id = id[cut+1:]
			}
			if id != "" && strings.HasSuffix(key, "\x00"+id) {
				delete(c.items, key)
			}
		}
	}
}

func (c *CachingChecker) ttl() time.Duration {
	if c.TTL == 0 {
		return DefaultTTL
	}
	return c.TTL
}

func (c *CachingChecker) now() time.Time {
	if c.Now == nil {
		return time.Now()
	}
	return c.Now()
}
