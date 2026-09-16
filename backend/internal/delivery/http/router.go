package http

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func NewRouter(handler *Handler) http.Handler {
	r := chi.NewRouter()

	// Standard middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	// Permissive CORS for web preview & Capacitor mobile app
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Cache"},
		ExposedHeaders:   []string{"Link", "X-Cache"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Health check endpoints
	r.Get("/healthz", handler.HealthCheck)
	r.Get("/health", handler.HealthCheck)

	// API v1
	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/institutes", handler.GetInstitutes)
		r.Get("/groups", handler.GetGroups)
		r.Get("/schedule", handler.GetSchedule)

		r.Route("/admin", func(r chi.Router) {
			r.Post("/sync-schedule", handler.TriggerSync)
			r.Get("/sync-schedule/status", handler.GetSyncStatus)
		})
	})

	return r
}
