package identity

import (
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
	"testing"
	"time"
)

func TestPasskeyOriginsMatchDefaultServer(t *testing.T) {
	handler, err := New(nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{"http://127.0.0.1:8080": true, "http://localhost:8080": true}
	if len(handler.WebAuthn.Config.RPOrigins) != len(want) {
		t.Fatalf("origins %v", handler.WebAuthn.Config.RPOrigins)
	}
	for _, origin := range handler.WebAuthn.Config.RPOrigins {
		if !want[origin] {
			t.Fatalf("origin %s is not the default server", origin)
		}
	}
}

func TestProductionRPRequiresVerifiedDiscoverableCredentials(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "login.example.org")
	t.Setenv("WEBAUTHN_EXTRA_ORIGINS", "android:apk-key-hash:test-certificate")
	handler, err := New(nil)
	if err != nil {
		t.Fatal(err)
	}
	config := handler.WebAuthn.Config
	if config.RPID != "login.example.org" || config.RPOrigins[0] != "https://login.example.org" {
		t.Fatalf("config %+v", config)
	}
	selection := config.AuthenticatorSelection
	if selection.UserVerification != protocol.VerificationRequired || selection.ResidentKey != protocol.ResidentKeyRequirementRequired {
		t.Fatalf("selection %+v", selection)
	}
	t.Setenv("WEBAUTHN_EXTRA_ORIGINS", "http://login.example.org")
	if _, err := New(nil); err == nil {
		t.Fatal("accepted cleartext production origin")
	}
}

func TestChallengesAreExpiringSingleUseAndBoundToCeremony(t *testing.T) {
	handler, err := New(nil)
	if err != nil {
		t.Fatal(err)
	}
	id, err := handler.remember(uuid.New(), "register", webauthn.SessionData{})
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := handler.consume(id.String(), "login"); ok {
		t.Fatal("mixed ceremonies")
	}
	if _, ok := handler.consume(id.String(), "register"); ok {
		t.Fatal("challenge reused")
	}
	id, _ = handler.remember(uuid.New(), "login", webauthn.SessionData{})
	value := handler.pending[id]
	value.expires = time.Now().Add(-time.Minute)
	handler.pending[id] = value
	if _, ok := handler.consume(id.String(), "login"); ok {
		t.Fatal("expired challenge accepted")
	}
}
