-- +goose Up
CREATE TABLE principal (
    id uuid PRIMARY KEY,
    display_name text NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE webauthn_credential (
    credential_id bytea PRIMARY KEY,
    principal_id uuid NOT NULL REFERENCES principal (id),
    public_key bytea NOT NULL,
    sign_count bigint NOT NULL,
    created_at timestamptz NOT NULL
);

CREATE TABLE session (
    id uuid PRIMARY KEY,
    principal_id uuid NOT NULL REFERENCES principal (id),
    secret_hash bytea NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE TABLE lesson_change (
    id uuid PRIMARY KEY,
    group_code text NOT NULL,
    author_id uuid NOT NULL REFERENCES principal (id),
    kind text NOT NULL,
    payload jsonb NOT NULL,
    recorded_at timestamptz NOT NULL
);

CREATE TABLE authz_audit (
    id uuid PRIMARY KEY,
    principal_id uuid,
    action text NOT NULL,
    object_type text NOT NULL,
    object_id text NOT NULL,
    allowed boolean NOT NULL,
    recorded_at timestamptz NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS authz_audit;
DROP TABLE IF EXISTS lesson_change;
DROP TABLE IF EXISTS session;
DROP TABLE IF EXISTS webauthn_credential;
DROP TABLE IF EXISTS principal;
