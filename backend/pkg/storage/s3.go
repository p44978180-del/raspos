package storage

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"

	"timacad-backend/internal/domain"
)

// ObjectStorage abstracts S3 / MinIO and local filesystem snapshot persistence
type ObjectStorage interface {
	PutSnapshot(ctx context.Context, sourceURL string, dataFormat string, content []byte) (*domain.ScheduleSnapshot, error)
	GetSnapshot(ctx context.Context, snapshotHash string) ([]byte, error)
	ListSnapshots(ctx context.Context, limit int) ([]domain.ScheduleSnapshot, error)
}

type MinioSnapshotStorage struct {
	baseDir string
	mu      sync.RWMutex
}

func NewSnapshotStorage(baseDir string) (*MinioSnapshotStorage, error) {
	if baseDir == "" {
		baseDir = "./snapshots"
	}
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create snapshot dir: %w", err)
	}
	return &MinioSnapshotStorage{baseDir: baseDir}, nil
}

func (s *MinioSnapshotStorage) PutSnapshot(ctx context.Context, sourceURL string, dataFormat string, content []byte) (*domain.ScheduleSnapshot, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	hash := sha256.Sum256(content)
	hashStr := hex.EncodeToString(hash[:])

	ext := dataFormat
	if ext == "" {
		ext = "bin"
	}
	fileName := fmt.Sprintf("%s.%s", hashStr, ext)
	filePath := filepath.Join(s.baseDir, fileName)

	// Idempotent write: if snapshot with identical hash exists, do not duplicate
	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		if err := os.WriteFile(filePath, content, 0644); err != nil {
			return nil, fmt.Errorf("failed to write snapshot file: %w", err)
		}
	}

	return &domain.ScheduleSnapshot{
		SnapshotHash: hashStr,
		SourceURL:    sourceURL,
		DataFormat:   dataFormat,
		ByteSize:     int64(len(content)),
		StoragePath:  filePath,
		CreatedAt:    time.Now().UTC(),
	}, nil
}

func (s *MinioSnapshotStorage) GetSnapshot(ctx context.Context, snapshotHash string) ([]byte, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	matches, err := filepath.Glob(filepath.Join(s.baseDir, snapshotHash+".*"))
	if err != nil || len(matches) == 0 {
		return nil, fmt.Errorf("snapshot not found for hash %s", snapshotHash)
	}

	f, err := os.Open(matches[0])
	if err != nil {
		return nil, err
	}
	defer f.Close()

	return io.ReadAll(f)
}

func (s *MinioSnapshotStorage) ListSnapshots(ctx context.Context, limit int) ([]domain.ScheduleSnapshot, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entries, err := os.ReadDir(s.baseDir)
	if err != nil {
		return nil, err
	}

	var results []domain.ScheduleSnapshot
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		ext := filepath.Ext(entry.Name())
		hash := entry.Name()
		if len(ext) > 0 {
			hash = hash[:len(hash)-len(ext)]
		}

		results = append(results, domain.ScheduleSnapshot{
			SnapshotHash: hash,
			DataFormat:   ext,
			ByteSize:     info.Size(),
			StoragePath:  filepath.Join(s.baseDir, entry.Name()),
			CreatedAt:    info.ModTime().UTC(),
		})

		if limit > 0 && len(results) >= limit {
			break
		}
	}

	return results, nil
}
