package http

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"timacad-backend/internal/delivery/realtime"
	"timacad-backend/internal/domain"
	"timacad-backend/internal/orchestrator"
	"timacad-backend/internal/repository/postgres"
	"timacad-backend/internal/usecase"
)

type Handler struct {
	instituteUC *usecase.InstituteUseCase
	groupUC     *usecase.GroupUseCase
	scheduleUC  *usecase.ScheduleUseCase
	syncUC      *usecase.SyncUseCase
	pgRepo      *postgres.Repository
	sseHub      *realtime.SSEHub
	orch        *orchestrator.Orchestrator
}

func NewHandler(
	instituteUC *usecase.InstituteUseCase,
	groupUC *usecase.GroupUseCase,
	scheduleUC *usecase.ScheduleUseCase,
	syncUC *usecase.SyncUseCase,
	pgRepo *postgres.Repository,
	sseHub *realtime.SSEHub,
	orch *orchestrator.Orchestrator,
) *Handler {
	return &Handler{
		instituteUC: instituteUC,
		groupUC:     groupUC,
		scheduleUC:  scheduleUC,
		syncUC:      syncUC,
		pgRepo:      pgRepo,
		sseHub:      sseHub,
		orch:        orch,
	}
}


func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	respondJSON(w, http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

// GetInstitutes handles GET /api/v1/institutes
func (h *Handler) GetInstitutes(w http.ResponseWriter, r *http.Request) {
	institutes, err := h.instituteUC.ListInstitutes(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve institutes: "+err.Error())
		return
	}
	respondJSON(w, http.StatusOK, institutes)
}

// GetGroups handles GET /api/v1/groups?institute_id=1&course=1
func (h *Handler) GetGroups(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	var instituteID *int
	if instStr := q.Get("institute_id"); instStr != "" {
		if id, err := strconv.Atoi(instStr); err == nil {
			instituteID = &id
		}
	}

	var course *int
	if courseStr := q.Get("course"); courseStr != "" {
		if c, err := strconv.Atoi(courseStr); err == nil {
			course = &c
		}
	}

	groups, err := h.groupUC.ListGroups(r.Context(), instituteID, course)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve groups: "+err.Error())
		return
	}
	respondJSON(w, http.StatusOK, groups)
}

// GetSchedule handles GET /api/v1/schedule?group_id=42&week=odd&sem=1
func (h *Handler) GetSchedule(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	groupIDStr := q.Get("group_id")
	if groupIDStr == "" {
		respondError(w, http.StatusBadRequest, "Missing required query parameter: group_id")
		return
	}

	groupID, err := strconv.Atoi(groupIDStr)
	if err != nil || groupID <= 0 {
		respondError(w, http.StatusBadRequest, "Invalid group_id parameter")
		return
	}

	week := q.Get("week")
	if week == "" {
		week = "all"
	}

	semester := 1
	if semStr := q.Get("sem"); semStr != "" {
		if s, err := strconv.Atoi(semStr); err == nil && s > 0 {
			semester = s
		}
	}

	schedule, isCacheHit, err := h.scheduleUC.GetSchedule(r.Context(), groupID, week, semester)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve schedule: "+err.Error())
		return
	}
	if schedule == nil {
		respondError(w, http.StatusNotFound, "Schedule not found")
		return
	}

	if isCacheHit {
		w.Header().Set("X-Cache", "HIT")
	} else {
		w.Header().Set("X-Cache", "MISS")
	}

	respondJSON(w, http.StatusOK, schedule)
}

// TriggerSync handles POST /api/v1/admin/sync-schedule
func (h *Handler) TriggerSync(w http.ResponseWriter, r *http.Request) {
	resp, err := h.syncUC.TriggerSync()
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to trigger sync: "+err.Error())
		return
	}

	status := http.StatusAccepted
	if resp.Status == "busy" {
		status = http.StatusConflict
	}

	respondJSON(w, status, resp)
}

// GetSyncStatus handles GET /api/v1/admin/sync-schedule/status
func (h *Handler) GetSyncStatus(w http.ResponseWriter, r *http.Request) {
	status := h.syncUC.GetStatus()
	respondJSON(w, http.StatusOK, status)
}

// GetEmptyClassrooms handles GET /api/v1/radar/empty-classrooms
func (h *Handler) GetEmptyClassrooms(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	building := q.Get("building")
	dayOfWeek := 1
	if d, err := strconv.Atoi(q.Get("day_of_week")); err == nil && d >= 1 && d <= 7 {
		dayOfWeek = d
	}
	slotNumber := 1
	if s, err := strconv.Atoi(q.Get("slot_number")); err == nil && s >= 1 && s <= 7 {
		slotNumber = s
	}
	weekType := q.Get("week_type")
	if weekType == "" {
		weekType = "all"
	}
	sockets := q.Get("sockets") == "1" || q.Get("sockets") == "true"
	quiet := q.Get("quiet") == "1" || q.Get("quiet") == "true"

	rooms, err := h.pgRepo.GetEmptyClassrooms(r.Context(), building, dayOfWeek, slotNumber, weekType, sockets, quiet)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to query radar: "+err.Error())
		return
	}

	resp := domain.EmptyClassroomsResponse{
		Building:   building,
		DayOfWeek:  dayOfWeek,
		SlotNumber: slotNumber,
		Classrooms: rooms,
		TotalEmpty: len(rooms),
	}
	respondJSON(w, http.StatusOK, resp)
}

// MatchWindows handles POST /api/v1/matchmaking/windows
func (h *Handler) MatchWindows(w http.ResponseWriter, r *http.Request) {
	var query domain.MatchWindowsQuery
	if err := json.NewDecoder(r.Body).Decode(&query); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid JSON body: "+err.Error())
		return
	}

	if query.DayOfWeek < 1 || query.DayOfWeek > 7 {
		query.DayOfWeek = 1
	}
	if query.WeekType == "" {
		query.WeekType = "all"
	}

	windows, err := h.pgRepo.MatchWindows(r.Context(), query.GroupIDs, query.DayOfWeek, query.WeekType)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Matchmaking error: "+err.Error())
		return
	}

	resp := domain.MatchWindowsResponse{
		SharedWindows:      windows,
		TotalSharedWindows: len(windows),
	}
	respondJSON(w, http.StatusOK, resp)
}

// GetCampusRoute handles GET /api/v1/navigation/route
func (h *Handler) GetCampusRoute(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from := q.Get("from")
	to := q.Get("to")
	windowMinutes := 15
	if win, err := strconv.Atoi(q.Get("window")); err == nil && win > 0 {
		windowMinutes = win
	}

	route := h.pgRepo.GetCampusRoute(from, to, windowMinutes)
	respondJSON(w, http.StatusOK, route)
}

// ProposeCrowdsourceChange handles POST /api/v1/crowdsource/propose
func (h *Handler) ProposeCrowdsourceChange(w http.ResponseWriter, r *http.Request) {
	var p domain.CrowdsourceProposal
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid proposal payload: "+err.Error())
		return
	}

	created, err := h.pgRepo.ProposeCrowdsourceChange(r.Context(), &p)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to submit proposal: "+err.Error())
		return
	}

	// Broadcast SSE event
	if h.sseHub != nil {
		payload, _ := json.Marshal(created)
		h.sseHub.Broadcast(domain.RealtimeScheduleEvent{
			EventID:     fmt.Sprintf("prop_%d", created.ID),
			EventType:   "PROPOSAL_CREATED",
			GroupID:     created.GroupID,
			PayloadJSON: string(payload),
			Timestamp:   time.Now().UTC().Format(time.RFC3339),
		})
	}

	respondJSON(w, http.StatusCreated, created)
}

// VoteCrowdsourceChange handles POST /api/v1/crowdsource/vote
func (h *Handler) VoteCrowdsourceChange(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProposalID  int64  `json:"proposal_id"`
		StudentName string `json:"student_name"`
		StudentRole string `json:"student_role"`
		VoteConfirm bool   `json:"vote_confirm"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		respondError(w, http.StatusBadRequest, "Invalid vote payload: "+err.Error())
		return
	}

	updated, err := h.pgRepo.VoteCrowdsourceChange(r.Context(), body.ProposalID, body.StudentName, body.StudentRole, body.VoteConfirm)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to register vote: "+err.Error())
		return
	}

	if h.sseHub != nil {
		payload, _ := json.Marshal(updated)
		h.sseHub.Broadcast(domain.RealtimeScheduleEvent{
			EventID:     fmt.Sprintf("vote_%d_%d", updated.ID, time.Now().UnixNano()),
			EventType:   "PEER_VOTE_ADDED",
			GroupID:     updated.GroupID,
			PayloadJSON: string(payload),
			Timestamp:   time.Now().UTC().Format(time.RFC3339),
		})
	}

	respondJSON(w, http.StatusOK, updated)
}

// ListCrowdsourceProposals handles GET /api/v1/crowdsource/proposals?group_id=42
func (h *Handler) ListCrowdsourceProposals(w http.ResponseWriter, r *http.Request) {
	groupID, err := strconv.Atoi(r.URL.Query().Get("group_id"))
	if err != nil || groupID <= 0 {
		respondError(w, http.StatusBadRequest, "Invalid or missing group_id parameter")
		return
	}

	proposals, err := h.pgRepo.ListCrowdsourceProposals(r.Context(), groupID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "Failed to retrieve proposals: "+err.Error())
		return
	}
	respondJSON(w, http.StatusOK, proposals)
}

// EventsSSE handles GET /api/v1/events
func (h *Handler) EventsSSE(w http.ResponseWriter, r *http.Request) {
	if h.sseHub != nil {
		h.sseHub.ServeHTTP(w, r)
		return
	}
	respondError(w, http.StatusNotImplemented, "SSE Hub not initialized")
}

func respondJSON(w http.ResponseWriter, code int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, code int, message string) {
	respondJSON(w, code, map[string]string{
		"error": message,
	})
}

