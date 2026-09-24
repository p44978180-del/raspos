package blob

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

// Open uses MinIO when MINIO_ENDPOINT is set and an in-memory store otherwise.
func Open(ctx context.Context) (Store, error) {
	endpoint := os.Getenv("MINIO_ENDPOINT")
	if endpoint == "" {
		return &Memory{}, nil
	}
	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(os.Getenv("MINIO_ACCESS_KEY"), os.Getenv("MINIO_SECRET_KEY"), ""),
		Secure: false,
	})
	if err != nil {
		return nil, err
	}
	bucket := os.Getenv("MINIO_BUCKET")
	if bucket == "" {
		bucket = "sources"
	}
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, err
	}
	if !exists {
		if err := client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{}); err != nil {
			return nil, err
		}
	}
	return &MinIO{client: client, bucket: bucket}, nil
}

type MinIO struct {
	client *minio.Client
	bucket string
}

func (m *MinIO) Put(ctx context.Context, hash string, body []byte) error {
	sum := sha256.Sum256(body)
	if hex.EncodeToString(sum[:]) != hash {
		return fmt.Errorf("object hash does not match its bytes")
	}
	_, err := m.client.PutObject(ctx, m.bucket, hash, bytes.NewReader(body), int64(len(body)), minio.PutObjectOptions{})
	return err
}

func (m *MinIO) Get(ctx context.Context, hash string) ([]byte, error) {
	object, err := m.client.GetObject(ctx, m.bucket, hash, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer object.Close()
	body, err := io.ReadAll(object)
	if err != nil {
		return nil, fmt.Errorf("object %s: %w", hash, err)
	}
	return body, nil
}
