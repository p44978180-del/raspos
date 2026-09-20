package http

import (
	"crypto/sha256"
	"crypto/subtle"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// Optional legacy API; v4 uses public dated files, not this backend.
func NewRouter(handler *Handler) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Cache-Control", "no-store")
			req.Body = http.MaxBytesReader(w, req.Body, 64<<10)
			next.ServeHTTP(w, req)
		})
	})
	// Public reads are intentional. Cross-origin mutations are not enabled.
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "OPTIONS"},
		AllowedHeaders: []string{"Accept", "Content-Type"},
		ExposedHeaders: []string{"X-Cache"},
		MaxAge:         300,
	}))
	r.Get("/healthz", handler.HealthCheck)
	r.Get("/health", handler.HealthCheck)
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/institutes", handler.GetInstitutes)
		r.Get("/groups", handler.GetGroups)
		r.Get("/schedule", handler.GetSchedule)
		r.Get("/radar/empty-classrooms", unavailableIntegration)
		r.Post("/matchmaking/windows", unavailableIntegration)
		r.Get("/navigation/route", unavailableIntegration)
		r.Post("/crowdsource/propose", unavailableIntegration)
		r.Post("/crowdsource/vote", unavailableIntegration)
		r.Get("/crowdsource/proposals", unavailableIntegration)
		r.Get("/events", unavailableIntegration)
		r.Route("/admin", func(r chi.Router) {
			r.Use(requireAdmin(os.Getenv("ADMIN_API_TOKEN")))
			// The old Python importer cannot ingest v4's dated catalog safely.
			r.Post("/sync-schedule", unavailableIntegration)
			r.Get("/sync-schedule/status", unavailableIntegration)
		})
	})
	// These old aliases were not an implemented Connect-RPC service.
	r.Handle("/schedule.v1.ScheduleService/*", http.HandlerFunc(unavailableIntegration))
	return r
}

func unavailableIntegration(w http.ResponseWriter, r *http.Request) {
	respondError(w, http.StatusNotImplemented, "This integration is unavailable. TIM Campus v4 uses verified public schedule files and device-local personal data.")
}

func requireAdmin(token string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(token) < 32 {
				respondError(w, http.StatusServiceUnavailable, "Administrative API is disabled")
				return
			}
			value := r.Header.Get("Authorization")
			provided := strings.TrimPrefix(value, "Bearer ")
			expectedHash, providedHash := sha256.Sum256([]byte(token)), sha256.Sum256([]byte(provided))
			if !strings.HasPrefix(value, "Bearer ") || subtle.ConstantTimeCompare(expectedHash[:], providedHash[:]) != 1 {
				w.Header().Set("WWW-Authenticate", "Bearer")
				respondError(w, http.StatusUnauthorized, "Administrator authentication required")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
