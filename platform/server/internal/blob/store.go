package blob

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"sync"
)

// Store keeps source bytes addressed by their SHA-256.
type Store interface {
	Put(ctx context.Context, hash string, body []byte) error
	Get(ctx context.Context, hash string) ([]byte, error)
}

type Memory struct {
	mu    sync.Mutex
	items map[string][]byte
}

func (m *Memory) Put(_ context.Context, hash string, body []byte) error {
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != hash {
		return fmt.Errorf("object hash does not match its bytes")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.items == nil {
		m.items = map[string][]byte{}
	}
	m.items[hash] = bytes.Clone(body)
	return nil
}

func (m *Memory) Get(_ context.Context, hash string) ([]byte, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	body, ok := m.items[hash]
	if !ok {
		return nil, fmt.Errorf("object %s is missing", hash)
	}
	return bytes.Clone(body), nil
}

// ReadAll reads a fetch body with a hard cap so a source cannot fill the disk.
func ReadAll(reader io.Reader, limit int64) ([]byte, error) {
	return io.ReadAll(io.LimitReader(reader, limit))
}
