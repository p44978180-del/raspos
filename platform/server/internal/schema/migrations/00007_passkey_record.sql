-- +goose Up
-- Keep the complete validated WebAuthn record, including backup eligibility.
-- Synced passkeys must retain BE across registration and subsequent assertions.
ALTER TABLE webauthn_credential ADD COLUMN credential_data jsonb;

-- +goose Down
ALTER TABLE webauthn_credential DROP COLUMN credential_data;
