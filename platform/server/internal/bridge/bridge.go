package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"

	"raspos/platform/server/internal/hint"
)

// Forward posts one hint to the Centrifugo HTTP API.
func Forward(ctx context.Context, payload []byte, apiURL, apiKey string, client *http.Client) error {
	item, err := hint.Decode(payload)
	if err != nil {
		return err
	}
	body, err := json.Marshal(map[string]any{
		"channel": hint.Channel(item.ScopeID),
		"data":    item,
	})
	if err != nil {
		return err
	}
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(apiURL, "/")+"/publish", bytes.NewReader(body))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-API-Key", apiKey)
	response, err := client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return fmt.Errorf("centrifugo status %d", response.StatusCode)
	}
	return nil
}

// Run copies JetStream hints to Centrifugo until the context ends.
func Run(ctx context.Context, natsURL, apiURL, apiKey string) error {
	conn, err := nats.Connect(natsURL)
	if err != nil {
		return err
	}
	defer conn.Close()
	js, err := jetstream.New(conn)
	if err != nil {
		return err
	}
	if _, err := js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{Name: hint.Stream, Subjects: []string{"schedule.>"}}); err != nil {
		return err
	}
	consumer, err := js.CreateOrUpdateConsumer(ctx, hint.Stream, jetstream.ConsumerConfig{
		Durable: "centrifugo", FilterSubject: hint.Subject, AckPolicy: jetstream.AckExplicitPolicy,
	})
	if err != nil {
		return err
	}
	done := ctx.Done()
	consume, err := consumer.Consume(func(msg jetstream.Msg) {
		if err := Forward(ctx, msg.Data(), apiURL, apiKey, nil); err != nil {
			msg.Nak()
			return
		}
		msg.Ack()
	})
	if err != nil {
		return err
	}
	defer consume.Stop()
	<-done
	return nil
}
