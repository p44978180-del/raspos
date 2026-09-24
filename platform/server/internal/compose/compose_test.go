//go:build compose

package compose

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	"github.com/coder/websocket"

	syncv1 "raspos/platform/server/internal/gen/timacad/sync/v1"
	syncv1connect "raspos/platform/server/internal/gen/timacad/sync/v1/syncv1connect"
	"raspos/platform/server/internal/hint"
)

func TestComposeHintThenPull(t *testing.T) {
	token := getenv(t, "INGEST_TOKEN")
	syncURL := envOr("SYNC_URL", "http://127.0.0.1:8088")
	centrifugo := envOr("CENTRIFUGO_WS", "ws://127.0.0.1:8000/connection/websocket")
	channel := hint.Channel("ДА 01-24")
	hints := make(chan hint.Hint, 1)
	socket, _, err := websocket.Dial(context.Background(), centrifugo, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = socket.CloseNow() })
	if err := writeFrame(socket, map[string]any{"id": 1, "connect": map[string]any{}}); err != nil {
		t.Fatal(err)
	}
	if _, err := readFrame(socket); err != nil {
		t.Fatal(err)
	}
	if err := writeFrame(socket, map[string]any{"id": 2, "subscribe": map[string]any{"channel": channel}}); err != nil {
		t.Fatal(err)
	}
	go func() {
		for {
			frame, err := readFrame(socket)
			if err != nil {
				return
			}
			push, _ := frame["push"].(map[string]any)
			pub, _ := push["pub"].(map[string]any)
			data, _ := pub["data"].(map[string]any)
			if data == nil {
				continue
			}
			raw, _ := json.Marshal(data)
			item, err := hint.Decode(raw)
			if err == nil {
				hints <- item
				return
			}
		}
	}()
	body := `{"url":"http://server:8080/fixtures/sample-group.html"}`
	request, err := http.NewRequest(http.MethodPost, syncURL+"/ingest", strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Ingest-Token", token)
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	payload, _ := io.ReadAll(response.Body)
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("ingest status %d body %s", response.StatusCode, payload)
	}
	var outcome struct {
		Status string `json:"status"`
		LSN    int64  `json:"lsn"`
	}
	if err := json.Unmarshal(payload, &outcome); err != nil {
		t.Fatal(err)
	}
	if outcome.Status == "applied" {
		select {
		case item := <-hints:
			if item.Collection != "lesson" || item.ScopeID != "ДА 01-24" || item.LSN < 1 {
				t.Fatalf("hint %+v", item)
			}
		case <-time.After(30 * time.Second):
			t.Fatal("centrifugo did not deliver the hint")
		}
	}
	client := syncv1connect.NewSyncServiceClient(http.DefaultClient, syncURL)
	stream, err := client.Pull(context.Background(), connect.NewRequest(&syncv1.PullRequest{
		Collection: "lesson", ScopeId: "ДА 01-24", SinceLsn: 0,
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !stream.Receive() {
		t.Fatal(stream.Err())
	}
	if stream.Msg().GetLsn() < 1 || len(stream.Msg().GetOp()) == 0 {
		t.Fatal("pull returned an empty lesson frame")
	}
}

func writeFrame(socket *websocket.Conn, frame map[string]any) error {
	payload, err := json.Marshal(frame)
	if err != nil {
		return err
	}
	return socket.Write(context.Background(), websocket.MessageText, payload)
}

func readFrame(socket *websocket.Conn) (map[string]any, error) {
	_, payload, err := socket.Read(context.Background())
	if err != nil {
		return nil, err
	}
	var frame map[string]any
	if err := json.Unmarshal(payload, &frame); err != nil {
		return nil, err
	}
	return frame, nil
}

func getenv(t *testing.T, key string) string {
	t.Helper()
	value := envOr(key, "")
	if value == "" {
		t.Fatalf("%s is required", key)
	}
	return value
}

func envOr(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}
