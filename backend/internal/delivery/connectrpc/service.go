package connectrpc

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"timacad-backend/internal/domain"
	"timacad-backend/internal/usecase"
)

// ConnectRPC Header constants for HTTP/2 and HTTP/3 transport
const (
	HeaderConnectProtocolVersion = "Connect-Protocol-Version"
	ConnectProtocolVersion       = "1"
	HeaderETag                   = "ETag"
	HeaderIfNoneMatch            = "If-None-Match"
)

type ScheduleServiceHandler struct {
	scheduleUsecase usecase.ScheduleUsecase
}

func NewScheduleServiceHandler(scheduleUsecase usecase.ScheduleUsecase) *ScheduleServiceHandler {
	return &ScheduleServiceHandler{
		scheduleUsecase: scheduleUsecase,
	}
}

type GetScheduleDeltaRequest struct {
	GroupID      int64  `json:"group_id"`
	Semester     int    `json:"semester"`
	ClientETag   string `json:"client_etag"`
	SchemaVer    int    `json:"schema_version"`
}

type GetScheduleDeltaResponse struct {
	ETag           string                   `json:"etag"`
	IsUnchanged    bool                     `json:"is_unchanged"`
	Lessons        []domain.LessonAssignment `json:"lessons,omitempty"`
	ServerTimestamp int64                   `json:"server_timestamp"`
}

// ServeHTTP handles Connect-RPC POST requests with HTTP/2 and HTTP/3 Protobuf/JSON payload
func (h *ScheduleServiceHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Connect-RPC requires POST method", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set(HeaderConnectProtocolVersion, ConnectProtocolVersion)
	w.Header().Set("Content-Type", "application/json")

	var req GetScheduleDeltaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid Connect-RPC payload: %v", err), http.StatusBadRequest)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	lessons, err := h.scheduleUsecase.GetSchedule(ctx, req.GroupID, req.Semester, "all")
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to fetch schedule: %v", err), http.StatusInternalServerError)
		return
	}

	// Compute deterministic SHA-256 binary hash of the schedule snapshot
	hashBytes, _ := json.Marshal(lessons)
	sum := sha256.Sum256(hashBytes)
	computedETag := fmt.Sprintf("W/\"%s-v3.0\"", hex.EncodeToString(sum[:8]))

	// If-None-Match 0ms Delta verification
	clientETag := req.ClientETag
	if clientETag == "" {
		clientETag = r.Header.Get(HeaderIfNoneMatch)
	}

	if clientETag != "" && clientETag == computedETag {
		w.Header().Set(HeaderETag, computedETag)
		w.WriteHeader(http.StatusNotModified)
		_ = json.NewEncoder(w).Encode(GetScheduleDeltaResponse{
			ETag:           computedETag,
			IsUnchanged:    true,
			ServerTimestamp: time.Now().Unix(),
		})
		return
	}

	w.Header().Set(HeaderETag, computedETag)
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(GetScheduleDeltaResponse{
		ETag:           computedETag,
		IsUnchanged:    false,
		Lessons:        lessons,
		ServerTimestamp: time.Now().Unix(),
	})
}
