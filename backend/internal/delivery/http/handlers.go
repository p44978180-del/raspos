package http

import (
	"encoding/json"
	"net/http"
	"strconv"

	"timacad-backend/internal/usecase"
)

type Handler struct {
	instituteUC *usecase.InstituteUseCase
	groupUC     *usecase.GroupUseCase
	scheduleUC  *usecase.ScheduleUseCase
	syncUC      *usecase.SyncUseCase
}

func NewHandler(
	instituteUC *usecase.InstituteUseCase,
	groupUC     *usecase.GroupUseCase,
	scheduleUC  *usecase.ScheduleUseCase,
	syncUC      *usecase.SyncUseCase,
) *Handler {
	return &Handler{
		instituteUC: instituteUC,
		groupUC:     groupUC,
		scheduleUC:  scheduleUC,
		syncUC:      syncUC,
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
