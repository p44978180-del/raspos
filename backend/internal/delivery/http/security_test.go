package http

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestUnavailableIntegrationsCannotReachDatabase(t *testing.T) {
	// Nil repositories would panic if the old mutation path were reached.
	router := NewRouter(&Handler{})
	for _, path := range []string{
		"/api/v1/crowdsource/propose", "/api/v1/crowdsource/vote",
		"/api/v1/matchmaking/windows", "/schedule.v1.ScheduleService/ProposeScheduleChange",
		"/schedule.v1.ScheduleService/VoteScheduleChange", "/schedule.v1.ScheduleService/MatchWindows",
	} {
		req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"student_role":"headstudent","student_name":"forged","group_ids":[1,1,1]}`))
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		if rec.Code != http.StatusNotImplemented {
			t.Fatalf("%s: want 501, got %d", path, rec.Code)
		}
	}
	for _, path := range []string{"/api/v1/crowdsource/proposals?group_id=1", "/api/v1/events", "/api/v1/radar/empty-classrooms"} {
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
		if rec.Code != http.StatusNotImplemented {
			t.Fatalf("%s: want 501, got %d", path, rec.Code)
		}
	}
}

func TestAdminAuthenticationFailClosed(t *testing.T) {
	valid := strings.Repeat("a", 48)
	for _, tc := range []struct {
		name, token, header string
		status              int
	}{
		{"unconfigured", "", "", http.StatusServiceUnavailable},
		{"short", "weak", "Bearer weak", http.StatusServiceUnavailable},
		{"missing", valid, "", http.StatusUnauthorized},
		{"wrong", valid, "Bearer " + strings.Repeat("b", 48), http.StatusUnauthorized},
		{"wrong-scheme", valid, "Basic " + valid, http.StatusUnauthorized},
		{"authorized", valid, "Bearer " + valid, http.StatusNoContent},
	} {
		t.Run(tc.name, func(t *testing.T) {
			next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusNoContent) })
			req := httptest.NewRequest(http.MethodPost, "/api/v1/admin/sync-schedule", nil)
			req.Header.Set("Authorization", tc.header)
			rec := httptest.NewRecorder()
			requireAdmin(tc.token)(next).ServeHTTP(rec, req)
			if rec.Code != tc.status {
				t.Fatalf("want %d, got %d", tc.status, rec.Code)
			}
		})
	}
}

func TestAdminRoutesCannotRunObsoleteIngestion(t *testing.T) {
	token := strings.Repeat("c", 48)
	t.Setenv("ADMIN_API_TOKEN", token)
	router := NewRouter(&Handler{})
	for _, tc := range []struct{ method, path string }{
		{http.MethodPost, "/api/v1/admin/sync-schedule"},
		{http.MethodGet, "/api/v1/admin/sync-schedule/status"},
	} {
		for _, authenticated := range []bool{false, true} {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			want := http.StatusUnauthorized
			if authenticated {
				req.Header.Set("Authorization", "Bearer "+token)
				want = http.StatusNotImplemented
			}
			rec := httptest.NewRecorder()
			router.ServeHTTP(rec, req)
			if rec.Code != want {
				t.Fatalf("%s: want %d, got %d", tc.path, want, rec.Code)
			}
		}
	}
}
