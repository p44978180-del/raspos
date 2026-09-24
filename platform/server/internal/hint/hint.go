package hint

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

const (
	Subject = "schedule.snapshot.published"
	Stream  = "TIMACAD"
)

// Hint is the only payload pushed to a device. The schedule itself stays in Pull.
type Hint struct {
	Collection string `json:"collection"`
	ScopeID    string `json:"scope_id"`
	LSN        int64  `json:"lsn"`
}

// Channel is Centrifugo's group channel. The id is hex so the name stays ASCII.
func Channel(scopeID string) string {
	return "group:" + hex.EncodeToString([]byte(scopeID))
}

type Publisher interface {
	Publish(ctx context.Context, hint Hint) error
}

type NATS struct {
	js jetstream.JetStream
}

func Connect(url string) (*NATS, error) {
	conn, err := nats.Connect(url)
	if err != nil {
		return nil, err
	}
	js, err := jetstream.New(conn)
	if err != nil {
		conn.Close()
		return nil, err
	}
	_, err = js.CreateOrUpdateStream(context.Background(), jetstream.StreamConfig{
		Name: Stream, Subjects: []string{"schedule.>"},
	})
	if err != nil {
		conn.Close()
		return nil, err
	}
	return &NATS{js: js}, nil
}

func (n *NATS) Publish(ctx context.Context, item Hint) error {
	payload, err := json.Marshal(item)
	if err != nil {
		return err
	}
	_, err = n.js.Publish(ctx, Subject, payload)
	return err
}

func Decode(payload []byte) (Hint, error) {
	var item Hint
	if err := json.Unmarshal(payload, &item); err != nil {
		return Hint{}, err
	}
	if item.Collection == "" || item.ScopeID == "" || item.LSN < 1 {
		return Hint{}, fmt.Errorf("hint is incomplete")
	}
	return item, nil
}

func ContentHash(body []byte) string {
	sum := sha256.Sum256(body)
	return hex.EncodeToString(sum[:])
}
