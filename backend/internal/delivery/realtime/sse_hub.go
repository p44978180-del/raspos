package realtime

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"timacad-backend/internal/domain"
)

type SSEClient struct {
	ID        string
	GroupID   int
	Channel   chan domain.RealtimeScheduleEvent
	Done      chan struct{}
}

type SSEHub struct {
	clients map[string]*SSEClient
	mu      sync.RWMutex
}

func NewSSEHub() *SSEHub {
	return &SSEHub{
		clients: make(map[string]*SSEClient),
	}
}

// Broadcast dispatches an event to all connected clients (filtered by GroupID if set)
func (h *SSEHub) Broadcast(event domain.RealtimeScheduleEvent) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	for _, client := range h.clients {
		if client.GroupID == 0 || event.GroupID == 0 || client.GroupID == event.GroupID {
			select {
			case client.Channel <- event:
			default:
				// Non-blocking drop if client is saturated
			}
		}
	}
}

// ServeHTTP handles GET /api/v1/events SSE connection
func (h *SSEHub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	var targetGroup int
	if gStr := r.URL.Query().Get("group_id"); gStr != "" {
		if g, err := strconv.Atoi(gStr); err == nil {
			targetGroup = g
		}
	}

	clientID := fmt.Sprintf("client_%d_%s", time.Now().UnixNano(), r.RemoteAddr)
	client := &SSEClient{
		ID:      clientID,
		GroupID: targetGroup,
		Channel: make(chan domain.RealtimeScheduleEvent, 16),
		Done:    make(chan struct{}),
	}

	h.mu.Lock()
	h.clients[clientID] = client
	h.mu.Unlock()

	log.Printf("[SSE] Client connected: %s (Group: %d)", clientID, targetGroup)

	// Send initial greeting event
	initData, _ := json.Marshal(map[string]any{
		"connected": true,
		"client_id": clientID,
		"group_id":  targetGroup,
		"time":      time.Now().UTC().Format(time.RFC3339),
	})
	fmt.Fprintf(w, "event: CONNECTED\ndata: %s\n\n", initData)
	flusher.Flush()

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			h.mu.Lock()
			delete(h.clients, clientID)
			close(client.Done)
			h.mu.Unlock()
			log.Printf("[SSE] Client disconnected: %s", clientID)
			return

		case <-ticker.C:
			// Heartbeat comment
			fmt.Fprintf(w, ": ping %d\n\n", time.Now().Unix())
			flusher.Flush()

		case evt := <-client.Channel:
			data, err := json.Marshal(evt)
			if err == nil {
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", evt.EventType, data)
				flusher.Flush()
			}
		}
	}
}
