-- +goose Up
CREATE TABLE push_receipt (
    replica_id uuid NOT NULL,
    client_seq bigint NOT NULL,
    collection text NOT NULL,
    scope_id text NOT NULL,
    lsn bigint NOT NULL,
    PRIMARY KEY (replica_id, client_seq)
);

CREATE TABLE loro_doc (
    doc_id text PRIMARY KEY,
    latest_snapshot bytea NOT NULL,
    snapshot_version bigint NOT NULL,
    updated_at timestamptz NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS loro_doc;
DROP TABLE IF EXISTS push_receipt;
