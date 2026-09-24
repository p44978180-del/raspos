package session

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"raspos/platform/server/internal/db"
)

const lifetime = 30 * 24 * time.Hour

func Issue(ctx context.Context, queries *db.Queries, principal uuid.UUID) (string, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", err
	}
	id := uuid.Must(uuid.NewV7())
	sum := sha256.Sum256(secret)
	if err := queries.InsertSession(ctx, db.InsertSessionParams{
		ID: id, PrincipalID: principal, SecretHash: sum[:],
		ExpiresAt: pgtype.Timestamptz{Time: time.Now().UTC().Add(lifetime), Valid: true},
	}); err != nil {
		return "", err
	}
	return id.String() + "." + base64.RawURLEncoding.EncodeToString(secret), nil
}

func Principal(ctx context.Context, queries *db.Queries, header string) (uuid.UUID, error) {
	value := strings.TrimSpace(header)
	if value == "" {
		return uuid.Nil, nil
	}
	token, ok := strings.CutPrefix(value, "Bearer ")
	if !ok {
		return uuid.Nil, errors.New("session token is missing")
	}
	idPart, secretPart, ok := strings.Cut(token, ".")
	if !ok {
		return uuid.Nil, errors.New("session token is malformed")
	}
	id, err := uuid.Parse(idPart)
	if err != nil {
		return uuid.Nil, errors.New("session token is malformed")
	}
	secret, err := base64.RawURLEncoding.DecodeString(secretPart)
	if err != nil {
		return uuid.Nil, errors.New("session token is malformed")
	}
	row, err := queries.FindSession(ctx, id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, errors.New("session is unknown")
	}
	if err != nil {
		return uuid.Nil, err
	}
	if !row.ExpiresAt.Valid || time.Now().After(row.ExpiresAt.Time) {
		return uuid.Nil, errors.New("session has expired")
	}
	sum := sha256.Sum256(secret)
	if subtle.ConstantTimeCompare(sum[:], row.SecretHash) != 1 {
		return uuid.Nil, errors.New("session token is invalid")
	}
	return row.PrincipalID, nil
}
