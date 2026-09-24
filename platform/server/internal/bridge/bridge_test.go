package bridge

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"raspos/platform/server/internal/hint"
)

func TestForwardPostsHintToCentrifugo(t *testing.T) {
	var got map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/publish" || r.Header.Get("X-API-Key") != "secret" {
			http.NotFound(w, r)
			return
		}
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		w.WriteHeader(http.StatusOK)
	}))
	t.Cleanup(server.Close)
	payload, _ := json.Marshal(hint.Hint{Collection: "lesson", ScopeID: "ДА 01-24", LSN: 4})
	if err := Forward(context.Background(), payload, server.URL+"/api", "secret", server.Client()); err != nil {
		t.Fatal(err)
	}
	if got["channel"] != hint.Channel("ДА 01-24") {
		t.Fatalf("channel %v", got["channel"])
	}
}
