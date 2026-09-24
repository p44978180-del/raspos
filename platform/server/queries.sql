-- name: UpsertInstitute :one
INSERT INTO institute (id, code, name)
VALUES ($1, $2, $3)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
RETURNING id;

-- name: UpsertStudentGroup :one
INSERT INTO student_group (
    id, institute_id, code, external_id, course, degree, study_form, status
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (code) DO UPDATE SET
    institute_id = EXCLUDED.institute_id,
    external_id = EXCLUDED.external_id,
    course = EXCLUDED.course,
    degree = EXCLUDED.degree,
    study_form = EXCLUDED.study_form,
    status = EXCLUDED.status
RETURNING id;

-- name: FindSnapshot :one
SELECT id FROM schedule_snapshot
WHERE group_id = $1 AND content_sha256 = $2;

-- name: InsertSourceDocument :one
INSERT INTO source_document (id, url, content_sha256, fetched_at)
VALUES ($1, $2, $3, $4)
RETURNING id;

-- name: InsertSnapshot :one
INSERT INTO schedule_snapshot (
    id, group_id, document_id, parser_version, content_sha256, lesson_count, valid_from
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;

-- name: SupersedeSnapshots :exec
UPDATE schedule_snapshot
SET superseded_at = $2
WHERE group_id = $1 AND superseded_at IS NULL AND content_sha256 <> $3;

-- name: InsertLesson :copyfrom
INSERT INTO lesson (
    id, snapshot_id, group_id, occurs_on, starts_at, ends_at,
    subject, kind, teacher, building, room, week_type, source_url
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);

-- name: NextLSN :one
SELECT (COALESCE(MAX(lsn), 0) + 1)::bigint AS next_lsn
FROM sync_log
WHERE collection = $1 AND scope_id = $2;

-- name: InsertSyncLog :exec
INSERT INTO sync_log (collection, scope_id, lsn, op, recorded_at)
VALUES ($1, $2, $3, $4, $5);

-- name: LatestSyncOp :one
SELECT lsn, op FROM sync_log
WHERE collection = $1 AND scope_id = $2
ORDER BY lsn DESC
LIMIT 1;

-- name: CountLessons :one
SELECT count(*)::bigint AS count FROM lesson;

-- name: CountGroups :one
SELECT count(*)::bigint AS count FROM student_group;

-- name: SyncOpsAfter :many
SELECT lsn, op FROM sync_log
WHERE collection = $1 AND scope_id = $2 AND lsn > $3
ORDER BY lsn ASC;

-- name: FindPushReceipt :one
SELECT lsn FROM push_receipt
WHERE replica_id = $1 AND client_seq = $2;

-- name: InsertPushReceipt :exec
INSERT INTO push_receipt (replica_id, client_seq, collection, scope_id, lsn)
VALUES ($1, $2, $3, $4, $5);

-- name: CountSyncOps :one
SELECT count(*)::bigint AS count FROM sync_log
WHERE collection = $1 AND scope_id = $2;

-- name: UpsertLoroDoc :exec
INSERT INTO loro_doc (doc_id, latest_snapshot, snapshot_version, updated_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (doc_id) DO UPDATE SET
    latest_snapshot = EXCLUDED.latest_snapshot,
    snapshot_version = EXCLUDED.snapshot_version,
    updated_at = EXCLUDED.updated_at;

-- name: GetLoroDoc :one
SELECT latest_snapshot, snapshot_version FROM loro_doc WHERE doc_id = $1;

-- name: InsertPrincipal :exec
INSERT INTO principal (id, display_name, created_at)
VALUES ($1, $2, $3);

-- name: InsertSession :exec
INSERT INTO session (id, principal_id, secret_hash, expires_at)
VALUES ($1, $2, $3, $4);

-- name: FindSession :one
SELECT principal_id, secret_hash, expires_at FROM session WHERE id = $1;

-- name: InsertWebAuthnCredential :exec
INSERT INTO webauthn_credential (credential_id, principal_id, public_key, sign_count, created_at)
VALUES ($1, $2, $3, $4, $5);

-- name: ListWebAuthnCredentials :many
SELECT credential_id, public_key, sign_count FROM webauthn_credential WHERE principal_id = $1;

-- name: UpdateWebAuthnSignCount :exec
UPDATE webauthn_credential SET sign_count = $2 WHERE credential_id = $1;

-- name: InsertLessonChange :exec
INSERT INTO lesson_change (id, group_code, author_id, kind, payload, recorded_at)
VALUES ($1, $2, $3, $4, $5, $6);

-- name: CountLessonChanges :one
SELECT count(*)::bigint AS count FROM lesson_change WHERE group_code = $1;

-- name: InsertAudit :exec
INSERT INTO authz_audit (id, principal_id, action, object_type, object_id, allowed, recorded_at)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: CountAudit :one
SELECT count(*)::bigint AS count FROM authz_audit
WHERE principal_id = $1 AND object_id = $2 AND allowed = $3;

-- name: LatestSourceHash :one
SELECT content_sha256 FROM source_document WHERE url = $1 ORDER BY fetched_at DESC LIMIT 1;

-- name: CurrentSnapshotHash :one
SELECT s.content_sha256
FROM schedule_snapshot s
JOIN student_group g ON g.id = s.group_id
WHERE g.code = $1 AND s.superseded_at IS NULL
ORDER BY s.valid_from DESC
LIMIT 1;

-- name: ListLoroDocs :many
SELECT doc_id, latest_snapshot, snapshot_version FROM loro_doc ORDER BY doc_id;

-- name: UpdateLoroSnapshot :exec
UPDATE loro_doc
SET latest_snapshot = $2, snapshot_version = $3, updated_at = $4
WHERE doc_id = $1;

-- name: DeleteSyncOpsBefore :exec
DELETE FROM sync_log WHERE collection = $1 AND scope_id = $2 AND lsn < $3;

-- name: MinSyncLSN :one
SELECT COALESCE(MIN(lsn), 0)::bigint AS min_lsn FROM sync_log WHERE collection = $1 AND scope_id = $2;

-- name: InsertHint :exec
INSERT INTO hint_outbox (id, collection, scope_id, lsn, created_at)
VALUES ($1, $2, $3, $4, $5);

-- name: ListUnpublishedHints :many
SELECT id, collection, scope_id, lsn FROM hint_outbox
WHERE published_at IS NULL
ORDER BY created_at
LIMIT 100;

-- name: MarkHintPublished :exec
UPDATE hint_outbox SET published_at = $2 WHERE id = $1;

-- name: LockSyncScope :exec
SELECT pg_advisory_xact_lock(hashtextextended($1, 0));

-- name: SyncScopeBytes :one
SELECT COALESCE(SUM(octet_length(op)), 0)::bigint AS bytes
FROM sync_log
WHERE collection = $1 AND scope_id = $2;

-- name: FindThreadGroup :one
SELECT group_code FROM thread WHERE id = $1;

-- name: InsertThread :exec
INSERT INTO thread (id, group_code, created_at) VALUES ($1, $2, $3)
ON CONFLICT (id) DO NOTHING;

-- name: InsertThreadEntry :exec
INSERT INTO thread_entry (thread_id, entry_lsn, author_id, body)
VALUES ($1, $2, $3, $4);

-- name: HideThreadEntry :execrows
UPDATE thread_entry
SET hidden_at = $3, hidden_by = $4
WHERE thread_id = $1 AND entry_lsn = $2 AND hidden_at IS NULL;

-- name: FindThreadEntry :one
SELECT author_id, (hidden_at IS NOT NULL)::boolean AS hidden
FROM thread_entry
WHERE thread_id = $1 AND entry_lsn = $2;

-- name: ListThreadEntryLSNs :many
SELECT entry_lsn FROM thread_entry WHERE thread_id = $1 ORDER BY entry_lsn;

-- name: InsertMiniappRelease :exec
INSERT INTO miniapp_release (app_id, version, bundle_sha256, signature, manifest, status, created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: SetMiniappStatus :exec
UPDATE miniapp_release SET status = $3 WHERE app_id = $1 AND version = $2;

-- name: FindPublishedMiniapp :one
SELECT version, bundle_sha256, signature, manifest
FROM miniapp_release
WHERE app_id = $1 AND status = 'published'
ORDER BY created_at DESC
LIMIT 1;
