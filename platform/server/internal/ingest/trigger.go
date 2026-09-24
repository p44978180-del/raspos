package ingest

import (
	"crypto/subtle"
	"encoding/json"
	"net/http"
)

type starter func(r *http.Request, pageURL string) (Outcome, error)

// Trigger starts one ingest when the caller presents the shared token.
func Trigger(token string, start starter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if token == "" || subtle.ConstantTimeCompare([]byte(r.Header.Get("X-Ingest-Token")), []byte(token)) != 1 {
			http.Error(w, "ingest is not available", http.StatusNotFound)
			return
		}
		var body struct {
			URL string `json:"url"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
			http.Error(w, "url is required", http.StatusBadRequest)
			return
		}
		result, err := start(r, body.URL)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result)
	}
}
