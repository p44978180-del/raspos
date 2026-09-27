package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

type countingBody struct{ read int64 }

func (b *countingBody) Read(p []byte) (int, error) {
	b.read += int64(len(p))
	clear(p)
	return len(p), nil
}

func (*countingBody) Close() error { return nil }

func TestH2CUpgradeBodyIsBoundedBeforeRouting(t *testing.T) {
	body := &countingBody{}
	req := httptest.NewRequest(http.MethodPost, "/auth/webauthn/login/finish", nil)
	req.Body = body
	req.ContentLength = -1
	req.Header.Set("Connection", "Upgrade, HTTP2-Settings")
	req.Header.Set("Upgrade", "h2c")
	req.Header.Set("HTTP2-Settings", "")
	called := false
	handler := transportHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		_, _ = io.Copy(io.Discard, r.Body)
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	if called || body.read > (16<<20)+1 || response.Code == http.StatusSwitchingProtocols {
		t.Fatalf("unbounded upgrade: called=%v read=%d status=%d", called, body.read, response.Code)
	}
}
