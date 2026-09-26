package identity

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"raspos/platform/server/internal/db"
	"raspos/platform/server/internal/session"
)

type principalUser struct {
	id          uuid.UUID
	name        string
	credentials []webauthn.Credential
}

func (u principalUser) WebAuthnID() []byte                         { return u.id[:] }
func (u principalUser) WebAuthnName() string                       { return u.name }
func (u principalUser) WebAuthnDisplayName() string                { return u.name }
func (u principalUser) WebAuthnCredentials() []webauthn.Credential { return u.credentials }

// Handler serves the passkey ceremony. A verified login issues the same session used by Push.
type Handler struct {
	WebAuthn *webauthn.WebAuthn
	Queries  *db.Queries
	mu       sync.Mutex
	pending  map[uuid.UUID]webauthn.SessionData
}

func New(queries *db.Queries) (*Handler, error) {
	origins := []string{"http://127.0.0.1:8080", "http://localhost:8080"}
	if extra := os.Getenv("WEBAUTHN_EXTRA_ORIGINS"); extra != "" {
		for _, origin := range strings.Split(extra, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				origins = append(origins, origin)
			}
		}
	}
	engine, err := webauthn.New(&webauthn.Config{
		RPDisplayName: "ТИМ",
		RPID:          "localhost",
		// Fully qualified origins. The default cmd/server address is 127.0.0.1:8080.
		// WEBAUTHN_EXTRA_ORIGINS adds the Android apk-key-hash origin for Credential Manager.
		RPOrigins: origins,
	})
	if err != nil {
		return nil, err
	}
	return &Handler{WebAuthn: engine, Queries: queries, pending: map[uuid.UUID]webauthn.SessionData{}}, nil
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /auth/webauthn/register/begin", h.beginRegistration)
	mux.HandleFunc("POST /auth/webauthn/register/finish", h.finishRegistration)
	mux.HandleFunc("POST /auth/webauthn/login/begin", h.beginLogin)
	mux.HandleFunc("POST /auth/webauthn/login/finish", h.finishLogin)
}

func (h *Handler) beginRegistration(w http.ResponseWriter, r *http.Request) {
	id := uuid.Must(uuid.NewV7())
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Студент"
	}
	if err := h.Queries.InsertPrincipal(r.Context(), db.InsertPrincipalParams{
		ID: id, DisplayName: name, CreatedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}); err != nil {
		http.Error(w, "registration is unavailable", http.StatusInternalServerError)
		return
	}
	user := principalUser{id: id, name: name}
	options, data, err := h.WebAuthn.BeginRegistration(user)
	if err != nil {
		http.Error(w, "registration is unavailable", http.StatusInternalServerError)
		return
	}
	h.mu.Lock()
	h.pending[id] = *data
	h.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Principal-Id", id.String())
	_ = protocolJSON(w, options)
}

func (h *Handler) finishRegistration(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.Header.Get("X-Principal-Id"))
	if err != nil {
		http.Error(w, "principal is missing", http.StatusBadRequest)
		return
	}
	h.mu.Lock()
	data, ok := h.pending[id]
	h.mu.Unlock()
	if !ok {
		http.Error(w, "registration challenge is missing", http.StatusBadRequest)
		return
	}
	user := principalUser{id: id, name: "Студент"}
	credential, err := h.WebAuthn.FinishRegistration(user, data, r)
	if err != nil {
		http.Error(w, "passkey was not accepted", http.StatusUnauthorized)
		return
	}
	if err := h.Queries.InsertWebAuthnCredential(r.Context(), db.InsertWebAuthnCredentialParams{
		CredentialID: credential.ID,
		PrincipalID:  id,
		PublicKey:    credential.PublicKey,
		SignCount:    int64(credential.Authenticator.SignCount),
		CreatedAt:    pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}); err != nil {
		http.Error(w, "registration is unavailable", http.StatusInternalServerError)
		return
	}
	h.issue(w, r, id)
}

func (h *Handler) beginLogin(w http.ResponseWriter, r *http.Request) {
	user, ok := h.loadUser(w, r)
	if !ok {
		return
	}
	if len(user.credentials) == 0 {
		http.Error(w, "passkey is not registered", http.StatusUnauthorized)
		return
	}
	options, data, err := h.WebAuthn.BeginLogin(user)
	if err != nil {
		http.Error(w, "login is unavailable", http.StatusInternalServerError)
		return
	}
	h.mu.Lock()
	h.pending[user.id] = *data
	h.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	_ = protocolJSON(w, options)
}

func (h *Handler) finishLogin(w http.ResponseWriter, r *http.Request) {
	user, ok := h.loadUser(w, r)
	if !ok {
		return
	}
	h.mu.Lock()
	data, pending := h.pending[user.id]
	h.mu.Unlock()
	if !pending {
		http.Error(w, "login challenge is missing", http.StatusBadRequest)
		return
	}
	credential, err := h.WebAuthn.FinishLogin(user, data, r)
	if err != nil {
		http.Error(w, "passkey was not accepted", http.StatusUnauthorized)
		return
	}
	if err := h.Queries.UpdateWebAuthnSignCount(r.Context(), db.UpdateWebAuthnSignCountParams{
		CredentialID: credential.ID, SignCount: int64(credential.Authenticator.SignCount),
	}); err != nil {
		http.Error(w, "login is unavailable", http.StatusInternalServerError)
		return
	}
	h.issue(w, r, user.id)
}

func (h *Handler) loadUser(w http.ResponseWriter, r *http.Request) (principalUser, bool) {
	id, err := uuid.Parse(r.Header.Get("X-Principal-Id"))
	if err != nil {
		http.Error(w, "principal is missing", http.StatusBadRequest)
		return principalUser{}, false
	}
	rows, err := h.Queries.ListWebAuthnCredentials(r.Context(), id)
	if err != nil {
		http.Error(w, "login is unavailable", http.StatusInternalServerError)
		return principalUser{}, false
	}
	credentials := make([]webauthn.Credential, 0, len(rows))
	for _, row := range rows {
		credentials = append(credentials, webauthn.Credential{
			ID: row.CredentialID, PublicKey: row.PublicKey,
			Authenticator: webauthn.Authenticator{SignCount: uint32(row.SignCount)},
		})
	}
	return principalUser{id: id, name: "Студент", credentials: credentials}, true
}

func (h *Handler) issue(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	token, err := session.Issue(r.Context(), h.Queries, id)
	if err != nil {
		http.Error(w, "session was not issued", http.StatusInternalServerError)
		return
	}
	h.mu.Lock()
	delete(h.pending, id)
	h.mu.Unlock()
	w.Header().Set("Content-Type", "application/json")
	payload, err := json.Marshal(map[string]string{"session": token})
	if err != nil {
		http.Error(w, "session was not issued", http.StatusInternalServerError)
		return
	}
	_, _ = w.Write(payload)
}

func protocolJSON(w http.ResponseWriter, options any) error {
	payload, err := json.Marshal(options)
	if err != nil {
		return err
	}
	_, err = w.Write(payload)
	return err
}

// Begin is used by tests to prove a ceremony starts with a challenge.
func (h *Handler) Begin(ctx context.Context, name string) (uuid.UUID, *protocol.CredentialCreation, error) {
	id := uuid.Must(uuid.NewV7())
	if err := h.Queries.InsertPrincipal(ctx, db.InsertPrincipalParams{
		ID: id, DisplayName: name, CreatedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	}); err != nil {
		return uuid.Nil, nil, err
	}
	options, data, err := h.WebAuthn.BeginRegistration(principalUser{id: id, name: name})
	if err != nil {
		return uuid.Nil, nil, err
	}
	h.mu.Lock()
	h.pending[id] = *data
	h.mu.Unlock()
	return id, options, nil
}
