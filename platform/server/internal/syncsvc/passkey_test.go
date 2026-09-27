package syncsvc

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/fxamacker/cbor/v2"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"raspos/platform/server/internal/db"
	"raspos/platform/server/internal/identity"
	"raspos/platform/server/internal/schema"
	"raspos/platform/server/internal/session"
)

// A software authenticator tests cryptographic verification and persistence.
// It is deliberately not evidence of a Credential Manager/biometric device run.
func TestSyncedPasskeyRegistrationDiscoverableLoginAndReplay(t *testing.T) {
	url := startPostgres(t)
	if err := schema.Up(url); err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	handler, err := identity.New(db.New(pool))
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	handler.Register(mux)
	call := func(path, body string, headers http.Header) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		for key, values := range headers {
			req.Header[key] = values
		}
		out := httptest.NewRecorder()
		mux.ServeHTTP(out, req)
		return out
	}
	enc := base64.RawURLEncoding.EncodeToString
	mustJSON := func(value any) []byte {
		data, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	mustCBOR := func(value any) []byte {
		data, err := cbor.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	challenge := func(rec *httptest.ResponseRecorder) string {
		if rec.Code != 200 {
			t.Fatalf("begin: %d %s", rec.Code, rec.Body.String())
		}
		var result struct {
			PublicKey struct {
				Challenge string `json:"challenge"`
			} `json:"publicKey"`
		}
		if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
			t.Fatal(err)
		}
		return result.PublicKey.Challenge
	}
	clientData := func(kind, challenge string) []byte {
		return mustJSON(map[string]any{"type": kind, "challenge": challenge, "origin": "http://localhost:8080", "crossOrigin": false})
	}
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	credID := make([]byte, 32)
	if _, err := rand.Read(credID); err != nil {
		t.Fatal(err)
	}
	rpHash := sha256.Sum256([]byte("localhost"))
	authData := func(flags byte, counter uint32) []byte {
		data := append([]byte{}, rpHash[:]...)
		data = append(data, flags)
		return binary.BigEndian.AppendUint32(data, counter)
	}
	started := call("/auth/webauthn/register/begin?name=Test", "", nil)
	creationData := clientData("webauthn.create", challenge(started))
	principal := uuid.MustParse(started.Header().Get("X-Principal-Id"))
	attested := authData(0x5d, 0) // UP, UV, backup eligible/state, attested credential data
	attested = append(attested, make([]byte, 16)...)
	attested = binary.BigEndian.AppendUint16(attested, uint16(len(credID)))
	attested = append(attested, credID...)
	attested = append(attested, mustCBOR(map[int]any{1: 2, 3: -7, -1: 1, -2: key.X.FillBytes(make([]byte, 32)), -3: key.Y.FillBytes(make([]byte, 32))})...)
	registration := string(mustJSON(map[string]any{
		"id": enc(credID), "rawId": enc(credID), "type": "public-key",
		"response": map[string]any{"clientDataJSON": enc(creationData), "attestationObject": enc(mustCBOR(map[string]any{"fmt": "none", "attStmt": map[string]any{}, "authData": attested})), "transports": []string{"internal"}},
	}))
	headers := http.Header{"X-Principal-Id": []string{principal.String()}, "X-Ceremony-Id": []string{started.Header().Get("X-Ceremony-Id")}}
	registered := call("/auth/webauthn/register/finish", registration, headers)
	if registered.Code != 200 {
		t.Fatalf("register: %d %s", registered.Code, registered.Body.String())
	}
	if replay := call("/auth/webauthn/register/finish", registration, headers); replay.Code == 200 {
		t.Fatal("registration replay accepted")
	}

	// Recreate the handler so login must recover the flags from PostgreSQL.
	handler, err = identity.New(db.New(pool))
	if err != nil {
		t.Fatal(err)
	}
	mux = http.NewServeMux()
	handler.Register(mux)
	assertion := func(challenge string, flags byte, count uint32) string {
		data := clientData("webauthn.get", challenge)
		auth := authData(flags, count)
		clientHash := sha256.Sum256(data)
		signedHash := sha256.Sum256(append(append([]byte{}, auth...), clientHash[:]...))
		sig, err := ecdsa.SignASN1(rand.Reader, key, signedHash[:])
		if err != nil {
			t.Fatal(err)
		}
		return string(mustJSON(map[string]any{"id": enc(credID), "rawId": enc(credID), "type": "public-key",
			"response": map[string]any{"clientDataJSON": enc(data), "authenticatorData": enc(auth), "signature": enc(sig), "userHandle": enc(principal[:])}}))
	}
	for _, flags := range []byte{0x19, 0x1d} { // First deny absent UV; then accept a verified synced key.
		begin := call("/auth/webauthn/login/begin", "", nil)
		body := assertion(challenge(begin), flags, 1)
		headers = http.Header{"X-Ceremony-Id": []string{begin.Header().Get("X-Ceremony-Id")}}
		login := call("/auth/webauthn/login/finish", body, headers)
		if flags == 0x19 {
			if login.Code != 401 {
				t.Fatalf("unverified user got %d", login.Code)
			}
			continue
		}
		if login.Code != 200 {
			t.Fatalf("login: %d %s", login.Code, login.Body.String())
		}
		var payload struct {
			Session string `json:"session"`
		}
		if err := json.Unmarshal(login.Body.Bytes(), &payload); err != nil {
			t.Fatal(err)
		}
		got, err := session.Principal(ctx, db.New(pool), "Bearer "+payload.Session)
		if err != nil || got != principal {
			t.Fatalf("session principal %s: %v", got, err)
		}
		if replay := call("/auth/webauthn/login/finish", body, headers); replay.Code == 200 {
			t.Fatal("login replay accepted")
		}
	}
}
