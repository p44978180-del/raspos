package ingest

import (
	"context"
	"io"
	"net/http"
	"time"
)

// HTTP fetches a source. Callers parse the saved bytes, not this response, after it is stored.
type HTTP struct {
	Client *http.Client
}

func (h HTTP) Get(ctx context.Context, pageURL string) (int, []byte, error) {
	client := h.Client
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, pageURL, nil)
	if err != nil {
		return 0, nil, err
	}
	response, err := client.Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, maxSourceBytes+1))
	if err != nil {
		return response.StatusCode, nil, err
	}
	return response.StatusCode, body, nil
}
