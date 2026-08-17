package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestReadinessReportsDependencyState(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name       string
		check      readinessCheck
		wantStatus int
		wantBody   string
	}{
		{
			name:       "ready",
			check:      func(context.Context) error { return nil },
			wantStatus: http.StatusOK,
			wantBody:   "ready",
		},
		{
			name: "dependency unavailable",
			check: func(context.Context) error {
				return errors.New("postgresql://secret@private-host/database")
			},
			wantStatus: http.StatusServiceUnavailable,
			wantBody:   "not ready",
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			response := httptest.NewRecorder()
			handler := handleReadiness(tt.check, readinessTimeout)

			handler(response, httptest.NewRequest(http.MethodGet, "/readyz", nil))

			assertProbeResponse(t, response, tt.wantStatus, tt.wantBody)
			if strings.Contains(response.Body.String(), "private-host") {
				t.Fatal("readiness response leaked dependency details")
			}
		})
	}
}

func TestReadinessBoundsDependencyCheck(t *testing.T) {
	t.Parallel()

	const timeout = 20 * time.Millisecond
	handler := handleReadiness(func(ctx context.Context) error {
		deadline, ok := ctx.Deadline()
		if !ok {
			return errors.New("dependency check has no deadline")
		}
		if remaining := time.Until(deadline); remaining <= 0 || remaining > timeout {
			return errors.New("dependency deadline is outside the configured bound")
		}
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

func TestHealthDoesNotCheckDependencies(t *testing.T) {
	t.Parallel()

	response := httptest.NewRecorder()
	handleHealth(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))

	assertProbeResponse(t, response, http.StatusOK, "ok")
}

func assertProbeResponse(
	t *testing.T,
	response *httptest.ResponseRecorder,
	status int,
	body string,
) {
	t.Helper()
	if response.Code != status || response.Body.String() != body {
		t.Fatalf("probe returned %d %q; want %d %q", response.Code, response.Body.String(), status, body)
	}
	for name, want := range map[string]string{
		"Cache-Control":          "no-store",
		"Content-Type":           "text/plain; charset=utf-8",
		"X-Content-Type-Options": "nosniff",
	} {
		if got := response.Header().Get(name); got != want {
			t.Errorf("%s = %q, want %q", name, got, want)
		}
	}
}
