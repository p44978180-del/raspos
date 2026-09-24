package miniapps

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"raspos/platform/server/internal/blob"
	"raspos/platform/server/internal/db"
)

var ErrNotPublished = errors.New("mini-app release is not published")

type Release struct {
	Version      string
	BundleSHA256 string
	Signature    string
	Manifest     []byte
	HostMethods  []string
}

type Registry struct {
	Queries *db.Queries
	Blobs   blob.Store
}

func (r Registry) InsertReview(ctx context.Context, manifest Manifest) error {
	return r.Queries.InsertMiniappRelease(ctx, db.InsertMiniappReleaseParams{
		AppID: manifest.ID, Version: manifest.Version, BundleSha256: manifest.BundleSHA256,
		Signature: manifest.Signature, Manifest: mustJSON(manifest), Status: "review",
		CreatedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
}

func (r Registry) SetStatus(ctx context.Context, appID, version, status string) error {
	return r.Queries.SetMiniappStatus(ctx, db.SetMiniappStatusParams{AppID: appID, Version: version, Status: status})
}

func (r Registry) Resolve(ctx context.Context, appID string) (Release, error) {
	row, err := r.Queries.FindPublishedMiniapp(ctx, appID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Release{}, ErrNotPublished
	}
	if err != nil {
		return Release{}, err
	}
	manifest, err := Parse(row.Manifest)
	if err != nil {
		return Release{}, err
	}
	return Release{
		Version: row.Version, BundleSHA256: row.BundleSha256, Signature: row.Signature,
		Manifest: row.Manifest, HostMethods: manifest.HostMethods,
	}, nil
}

func (r Registry) StoreBundle(ctx context.Context, hash string, bundle []byte) error {
	return r.Blobs.Put(ctx, hash, bundle)
}

func mustJSON(manifest Manifest) []byte {
	raw, err := jsonMarshal(manifest)
	if err != nil {
		panic(err)
	}
	return raw
}
