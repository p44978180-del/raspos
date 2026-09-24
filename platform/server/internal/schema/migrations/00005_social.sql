-- +goose Up
CREATE TABLE thread (
    id text PRIMARY KEY,
    group_code text NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE thread_entry (
    thread_id text NOT NULL REFERENCES thread (id),
    entry_lsn bigint NOT NULL,
    author_id uuid NOT NULL REFERENCES principal (id),
    body text NOT NULL,
    hidden_at timestamptz,
    hidden_by uuid,
    PRIMARY KEY (thread_id, entry_lsn)
);

-- +goose Down
DROP TABLE IF EXISTS thread_entry;
DROP TABLE IF EXISTS thread;