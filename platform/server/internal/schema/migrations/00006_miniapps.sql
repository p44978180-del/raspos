-- +goose Up
CREATE TABLE miniapp_release (
    app_id text NOT NULL,
    version text NOT NULL,
    bundle_sha256 text NOT NULL,
    signature text NOT NULL,
    manifest jsonb NOT NULL,
    status text NOT NULL CHECK (status IN ('review', 'published', 'rejected', 'revoked')),
    created_at timestamptz NOT NULL,
    PRIMARY KEY (app_id, version)
);

-- +goose Down
DROP TABLE IF EXISTS miniapp_release;
