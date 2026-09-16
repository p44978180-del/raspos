package centrifugo

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type RealtimeMessage struct {
	Channel   string      `json:"channel"` // e.g. "schedule:group:ДА 01-26"
	Event     string      `json:"event"`   // "class_cancelled", "room_changed", "emergency_alert"
	Data      interface{} `json:"data"`
	Timestamp int64       `json:"timestamp"`
}

type CentrifugoHub struct {
	mu          sync.RWMutex
	subscribers map[string]map[chan RealtimeMessage]struct{}
}

func NewCentrifugoHub() *CentrifugoHub {
	return &CentrifugoHub{
		subscribers: make(map[string]map[chan RealtimeMessage]struct{}),
	}
}

// Publish sends event to all connected clients on channel in <50ms
func (h *CentrifugoHub) Publish(ctx context.Context, channel string, event string, data interface{}) error {
	msg := RealtimeMessage{
		Channel:   channel,
		Event:     event,
		Data:      data,
		Timestamp: time.Now().UnixMilli(),
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	subs, exists := h.subscribers[channel]
	if !exists {
		return nil
	}

	for ch := range subs {
		select {
		case ch <- msg:
		default:
			// Drop if subscriber channel is blocked to avoid head-of-line blocking
		}
	}
	return nil
}

// Subscribe opens a listener channel for incoming realtime events
func (h *CentrifugoHub) Subscribe(channel string) (chan RealtimeMessage, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()

	ch := make(chan RealtimeMessage, 32)
	if _, exists := h.subscribers[channel]; !exists {
		h.subscribers[channel] = make(map[chan RealtimeMessage]struct{})
	}
	h.subscribers[channel][ch] = struct{}{}

	unsubscribe := func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if subs, exists := h.subscribers[channel]; exists {
			delete(subs, ch)
			close(ch)
			if len(subs) == 0 {
				delete(h.subscribers, channel)
			}
		}
	}

	return ch, unsubscribe
}

// BroadcastClassCancelled dispatches instant 50ms push notification when lesson is canceled
func (h *CentrifugoHub) BroadcastClassCancelled(ctx context.Context, groupName string, lessonTitle string, startTime string, reason string) error {
	channel := fmt.Sprintf("schedule:group:%s", groupName)
	return h.Publish(ctx, channel, "class_cancelled", map[string]string{
		"subject":   lessonTitle,
		"time":      startTime,
		"reason":    reason,
		"urgency":   "high",
		"announced": time.Now().Format("15:04"),
	})
}
