-- +goose Up
CREATE TABLE hint_outbox (
    id uuid PRIMARY KEY,
    collection text NOT NULL,
    scope_id text NOT NULL,
    lsn bigint NOT NULL,
    created_at timestamptz NOT NULL,
    published_at timestamptz
);

-- +goose Down
DROP TABLE IF EXISTS hint_outbox;
