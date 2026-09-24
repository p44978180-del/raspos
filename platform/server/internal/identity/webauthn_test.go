package identity

import "testing"

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
