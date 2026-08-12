package main

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

const readinessTimeout = 2 * time.Second

type dependencyCheck func(context.Context) error

func registerReadinessRoute(r chi.Router, check dependencyCheck) {
	r.Get("/readyz", handleReadiness(check, readinessTimeout))
}

func handleReadiness(check dependencyCheck, timeout time.Duration) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		if err := check(ctx); err != nil {
			writeProbeResponse(w, http.StatusServiceUnavailable, "not ready")
			return
		}
		writeProbeResponse(w, http.StatusOK, "ready")
	}
}

func writeProbeResponse(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}
