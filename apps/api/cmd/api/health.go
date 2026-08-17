package main

import (
	"context"
	"net/http"
	"time"
)

const readinessTimeout = 2 * time.Second

type readinessCheck func(context.Context) error

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeProbeResponse(w, http.StatusOK, "ok")
}

func handleReadiness(check readinessCheck, timeout time.Duration) http.HandlerFunc {
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
