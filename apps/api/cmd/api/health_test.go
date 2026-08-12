package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

func TestReadinessRoute(t *testing.T) {
	t.Parallel()
	router := chi.NewRouter()
	registerReadinessRoute(router, func(context.Context) error { return nil })
	response := httptest.NewRecorder()

	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	assertProbeResponse(t, response, http.StatusOK, "ready")
}

func TestReadinessChecksDependencyWithDeadline(t *testing.T) {
	t.Parallel()
	var deadline time.Time
	handler := handleReadiness(func(ctx context.Context) error {
		var ok bool
		deadline, ok = ctx.Deadline()
		if !ok {
			t.Fatal("dependency check has no deadline")
		}
		return nil
	}, readinessTimeout)
	response := httptest.NewRecorder()

	handler(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	assertProbeResponse(t, response, http.StatusOK, "ready")
	remaining := time.Until(deadline)
	if remaining <= 0 || remaining > readinessTimeout {
		t.Fatalf("dependency deadline has unexpected duration: %v", remaining)
	}
}

func TestReadinessHidesDependencyFailure(t *testing.T) {
	t.Parallel()
	handler := handleReadiness(func(context.Context) error {
		return errors.New("postgresql://secret@private-host/database")
	}, readinessTimeout)
	response := httptest.NewRecorder()

	handler(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	assertProbeResponse(t, response, http.StatusServiceUnavailable, "not ready")
	if strings.Contains(response.Body.String(), "private-host") {
		t.Fatal("readiness response leaked dependency error")
	}
}

func TestReadinessBoundsDependencyCheck(t *testing.T) {
	t.Parallel()
	const timeout = 20 * time.Millisecond
	handler := handleReadiness(func(ctx context.Context) error {
		<-ctx.Done()
		return ctx.Err()
	}, timeout)
	response := httptest.NewRecorder()
	started := time.Now()

	handler(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	assertProbeResponse(t, response, http.StatusServiceUnavailable, "not ready")
	if elapsed := time.Since(started); elapsed < timeout || elapsed > time.Second {
		t.Fatalf("readiness timeout took %v", elapsed)
	}
}

func assertProbeResponse(t *testing.T, response *httptest.ResponseRecorder, status int, body string) {
	t.Helper()
	if response.Code != status || response.Body.String() != body {
		t.Fatalf("probe returned %d %q; want %d %q", response.Code, response.Body.String(), status, body)
	}
	if response.Header().Get("Cache-Control") != "no-store" ||
		response.Header().Get("Content-Type") != "text/plain; charset=utf-8" ||
		response.Header().Get("X-Content-Type-Options") != "nosniff" {
		t.Fatalf("unexpected probe headers: %+v", response.Header())
	}
}
