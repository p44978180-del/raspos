package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
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
	pending  map[uuid.UUID]ceremony
}

type ceremony struct {
	data      webauthn.SessionData
	principal uuid.UUID
	kind      string
	name      string
	expires   time.Time
}

func New(queries *db.Queries) (*Handler, error) {
	rpID := strings.TrimSpace(os.Getenv("WEBAUTHN_RP_ID"))
	if rpID == "" {
		rpID = "localhost"
	}
	if strings.ContainsAny(rpID, "/:@ ") {
		return nil, errors.New("WEBAUTHN_RP_ID must be a hostname")
	}
	origins := []string{"http://127.0.0.1:8080", "http://localhost:8080"}
	if rpID != "localhost" {
		origins = []string{"https://" + rpID}
	}
	if extra := os.Getenv("WEBAUTHN_EXTRA_ORIGINS"); extra != "" {
		for _, origin := range strings.Split(extra, ",") {
			origin = strings.TrimSpace(origin)
			if origin != "" {
				if !strings.HasPrefix(origin, "android:apk-key-hash:") {
					parsed, err := url.Parse(origin)
					if err != nil || parsed.Scheme != "https" || parsed.Hostname() != rpID || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
						return nil, fmt.Errorf("invalid WebAuthn origin for RP %s", rpID)
					}
				}
				origins = append(origins, origin)
			}
		}
	}
	engine, err := webauthn.New(&webauthn.Config{
		RPDisplayName: "ТИМ",
		RPID:          rpID,
		// Fully qualified origins. The default cmd/server address is 127.0.0.1:8080.
		// WEBAUTHN_EXTRA_ORIGINS adds the Android apk-key-hash origin for Credential Manager.
		RPOrigins: origins,
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			RequireResidentKey: protocol.ResidentKeyRequired(),
			UserVerification:   protocol.VerificationRequired,
		},
		Timeouts: webauthn.TimeoutsConfig{
			Login:        webauthn.TimeoutConfig{Enforce: true, Timeout: 5 * time.Minute},
			Registration: webauthn.TimeoutConfig{Enforce: true, Timeout: 5 * time.Minute},
		},
	})
	if err != nil {
		return nil, err
	}
	return &Handler{WebAuthn: engine, Queries: queries, pending: map[uuid.UUID]ceremony{}}, nil
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /auth/session", h.sessionInfo)
	mux.HandleFunc("POST /auth/webauthn/register/begin", h.beginRegistration)
	mux.HandleFunc("POST /auth/webauthn/register/finish", h.finishRegistration)
	mux.HandleFunc("POST /auth/webauthn/login/begin", h.beginLogin)
	mux.HandleFunc("POST /auth/webauthn/login/finish", h.finishLogin)
}

func (h *Handler) sessionInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	principal, err := session.Principal(r.Context(), h.Queries, r.Header.Get("Authorization"))
	if err != nil || principal == uuid.Nil {
		http.Error(w, "session required", http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"principal_id": principal.String()})
}

func (h *Handler) beginRegistration(w http.ResponseWriter, r *http.Request) {
	id := uuid.Must(uuid.NewV7())
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Студент"
	}
	if len(name) > 256 {
		http.Error(w, "display name is too long", http.StatusBadRequest)
		return
	}
	user := principalUser{id: id, name: name}
	options, data, err := h.WebAuthn.BeginRegistration(user)
	if err != nil {
		http.Error(w, "registration is unavailable", http.StatusInternalServerError)
		return
	}
	ceremonyID, err := h.remember(id, "register", *data, name)
	if err != nil {
		http.Error(w, "too many challenges", http.StatusTooManyRequests)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Ceremony-Id", ceremonyID.String())
	w.Header().Set("X-Principal-Id", id.String())
	_ = protocolJSON(w, options)
}

func (h *Handler) finishRegistration(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.Header.Get("X-Principal-Id"))
	if err != nil {
		http.Error(w, "principal is missing", http.StatusBadRequest)
		return
	}
	data, ok := h.consume(r.Header.Get("X-Ceremony-Id"), "register")
	if !ok || data.principal != id {
		http.Error(w, "registration challenge is missing", http.StatusBadRequest)
		return
	}
	user := principalUser{id: id, name: data.name}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	credential, err := h.WebAuthn.FinishRegistration(user, data.data, r)
	if err != nil {
		http.Error(w, "passkey was not accepted", http.StatusUnauthorized)
		return
	}
	record, err := json.Marshal(credential)
	if err != nil {
		http.Error(w, "registration is unavailable", http.StatusInternalServerError)
		return
	}
	if err := h.Queries.RegisterWebAuthnCredential(r.Context(), db.RegisterWebAuthnCredentialParams{
		CredentialID:   credential.ID,
		PrincipalID:    id,
		DisplayName:    data.name,
		PublicKey:      credential.PublicKey,
		SignCount:      int64(credential.Authenticator.SignCount),
		CreatedAt:      pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
		CredentialData: record,
	}); err != nil {
		http.Error(w, "registration is unavailable", http.StatusInternalServerError)
		return
	}
	h.issue(w, r, id)
}

func (h *Handler) beginLogin(w http.ResponseWriter, r *http.Request) {
	options, data, err := h.WebAuthn.BeginDiscoverableLogin()
	if err != nil {
		http.Error(w, "login is unavailable", http.StatusInternalServerError)
		return
	}
	id, err := h.remember(uuid.Nil, "login", *data)
	if err != nil {
		http.Error(w, "too many challenges", http.StatusTooManyRequests)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Ceremony-Id", id.String())
	_ = protocolJSON(w, options)
}

func (h *Handler) finishLogin(w http.ResponseWriter, r *http.Request) {
	data, pending := h.consume(r.Header.Get("X-Ceremony-Id"), "login")
	if !pending {
		http.Error(w, "login challenge is missing", http.StatusBadRequest)
		return
	}
	var principal uuid.UUID
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	credential, err := h.WebAuthn.FinishDiscoverableLogin(func(rawID, userHandle []byte) (webauthn.User, error) {
		id, err := uuid.FromBytes(userHandle)
		if err != nil {
			return nil, err
		}
		user, err := h.loadUser(r.Context(), id)
		if err != nil {
			return nil, err
		}
		for _, stored := range user.credentials {
			if bytes.Equal(stored.ID, rawID) {
				principal = id
				return user, nil
			}
		}
		return nil, errors.New("credential does not belong to this user")
	}, data.data, r)
	if err != nil {
		http.Error(w, "passkey was not accepted", http.StatusUnauthorized)
		return
	}
	record, err := json.Marshal(credential)
	if err != nil {
		http.Error(w, "login is unavailable", http.StatusInternalServerError)
		return
	}
	if err := h.Queries.UpdateWebAuthnCredential(r.Context(), db.UpdateWebAuthnCredentialParams{
		CredentialID: credential.ID, SignCount: int64(credential.Authenticator.SignCount), CredentialData: record,
	}); err != nil {
		http.Error(w, "login is unavailable", http.StatusInternalServerError)
		return
	}
	h.issue(w, r, principal)
}

func (h *Handler) loadUser(ctx context.Context, id uuid.UUID) (principalUser, error) {
	rows, err := h.Queries.ListWebAuthnCredentials(ctx, id)
	if err != nil {
		return principalUser{}, err
	}
	credentials := make([]webauthn.Credential, 0, len(rows))
	for _, row := range rows {
		credential := webauthn.Credential{
			ID: row.CredentialID, PublicKey: row.PublicKey,
			Authenticator: webauthn.Authenticator{SignCount: uint32(row.SignCount)},
		}
		if len(row.CredentialData) > 0 {
			if err := json.Unmarshal(row.CredentialData, &credential); err != nil {
				return principalUser{}, err
			}
		}
		credentials = append(credentials, credential)
	}
	return principalUser{id: id, name: "Студент", credentials: credentials}, nil
}

func (h *Handler) issue(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	token, err := session.Issue(r.Context(), h.Queries, id)
	if err != nil {
		http.Error(w, "session was not issued", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
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
	if _, err := h.remember(id, "register", *data); err != nil {
		return uuid.Nil, nil, err
	}
	return id, options, nil
}

func (h *Handler) remember(principal uuid.UUID, kind string, data webauthn.SessionData, names ...string) (uuid.UUID, error) {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := time.Now()
	for id, pending := range h.pending {
		if !now.Before(pending.expires) {
			delete(h.pending, id)
		}
	}
	if len(h.pending) >= 4096 {
		return uuid.Nil, errors.New("challenge capacity exceeded")
	}
	id := uuid.New()
	name := ""
	if len(names) > 0 {
		name = names[0]
	}
	h.pending[id] = ceremony{data: data, principal: principal, kind: kind, name: name, expires: now.Add(5 * time.Minute)}
	return id, nil
}

func (h *Handler) consume(raw, kind string) (ceremony, bool) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return ceremony{}, false
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	value, ok := h.pending[id]
	delete(h.pending, id)
	return value, ok && value.kind == kind && time.Now().Before(value.expires)
}
