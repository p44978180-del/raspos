package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthCheck(t *testing.T) {
	handler := &Handler{}
	router := NewRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var resp map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode json: %v", err)
	}

	if resp["status"] != "healthy" {
		t.Errorf("expected status 'healthy', got %q", resp["status"])
	}
}

func TestGetScheduleValidation(t *testing.T) {
	handler := &Handler{}
	router := NewRouter(handler)

	// Missing group_id
	req := httptest.NewRequest(http.MethodGet, "/api/v1/schedule", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for missing group_id, got %d", rec.Code)
	}

	// Invalid group_id
	req2 := httptest.NewRequest(http.MethodGet, "/api/v1/schedule?group_id=abc", nil)
	rec2 := httptest.NewRecorder()

	router.ServeHTTP(rec2, req2)

	if rec2.Code != http.StatusBadRequest {
		t.Fatalf("expected status 400 for invalid group_id, got %d", rec2.Code)
	}
}

func TestGetCampusRoute(t *testing.T) {
	handler := &Handler{}
	router := NewRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/navigation/route?from=1-й%20учебный%20корпус&to=28-й%20Инженерный%20корпус&window=15", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("unverified route must not be presented as navigation: got %d", rec.Code)
	}
}

func TestConnectRPCGetCampusRoute(t *testing.T) {
	handler := &Handler{}
	router := NewRouter(handler)

	req := httptest.NewRequest(http.MethodGet, "/schedule.v1.ScheduleService/GetCampusRoute?from=12-й%20учебный%20корпус&to=СК", nil)
	rec := httptest.NewRecorder()

	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotImplemented {
		t.Fatalf("unimplemented protocol must fail closed: got %d", rec.Code)
	}
}
