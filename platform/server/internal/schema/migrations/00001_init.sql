-- +goose Up
CREATE TABLE institute (
    id uuid PRIMARY KEY,
    code text NOT NULL UNIQUE,
    name text NOT NULL
);

CREATE TABLE student_group (
    id uuid PRIMARY KEY,
    institute_id uuid NOT NULL REFERENCES institute (id),
    code text NOT NULL UNIQUE,
    external_id integer NOT NULL,
    course integer NOT NULL,
    degree text NOT NULL,
    study_form text NOT NULL,
    status text NOT NULL
);

CREATE TABLE source_document (
    id uuid PRIMARY KEY,
    url text NOT NULL,
    content_sha256 text NOT NULL,
    fetched_at timestamptz NOT NULL
);

CREATE TABLE schedule_snapshot (
    id uuid PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES student_group (id),
    document_id uuid NOT NULL REFERENCES source_document (id),
    parser_version text NOT NULL,
    content_sha256 text NOT NULL,
    lesson_count integer NOT NULL,
    valid_from timestamptz NOT NULL,
    superseded_at timestamptz,
    UNIQUE (group_id, content_sha256)
);

CREATE TABLE lesson (
    id uuid PRIMARY KEY,
    snapshot_id uuid NOT NULL REFERENCES schedule_snapshot (id) ON DELETE CASCADE,
    group_id uuid NOT NULL REFERENCES student_group (id) ON DELETE CASCADE,
    occurs_on date NOT NULL,
    starts_at time NOT NULL,
    ends_at time NOT NULL,
    subject text NOT NULL,
    kind text NOT NULL,
    teacher text NOT NULL,
    building text NOT NULL,
    room text NOT NULL,
    week_type text NOT NULL,
    source_url text NOT NULL
);

CREATE INDEX lesson_group_day ON lesson (group_id, occurs_on);

CREATE TABLE sync_log (
    collection text NOT NULL,
    scope_id text NOT NULL,
    lsn bigint NOT NULL,
    op bytea NOT NULL,
    recorded_at timestamptz NOT NULL,
    PRIMARY KEY (collection, scope_id, lsn)
);

-- +goose Down
DROP TABLE IF EXISTS sync_log;
DROP TABLE IF EXISTS lesson;
DROP TABLE IF EXISTS schedule_snapshot;
DROP TABLE IF EXISTS source_document;
DROP TABLE IF EXISTS student_group;
DROP TABLE IF EXISTS institute;
