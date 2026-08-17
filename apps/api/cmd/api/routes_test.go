package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

func TestRouterAppliesSecurityHeaders(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name     string
		secure   bool
		wantHSTS string
	}{
		{name: "HTTPS deployment", secure: true, wantHSTS: "max-age=31536000"},
		{name: "local HTTP deployment"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			authService := auth.NewService(nil, auth.Config{})
			router := newRouter(
				authService,
				api.Unimplemented{},
				http.NotFoundHandler(),
				func(context.Context) error { return nil },
				64,
				slog.New(slog.NewTextHandler(io.Discard, nil)),
				tt.secure,
			)
			for _, endpoint := range []struct {
				path       string
				wantStatus int
			}{
				{path: "/healthz", wantStatus: http.StatusOK},
				{path: "/readyz", wantStatus: http.StatusOK},
				{path: "/unknown", wantStatus: http.StatusNotFound},
			} {
				response := httptest.NewRecorder()
				request := httptest.NewRequest(http.MethodGet, endpoint.path, nil)
				request.Header.Set(httpx.RequestIDHeader, "caller-request-id")
				router.ServeHTTP(response, request)

				if response.Code != endpoint.wantStatus {
					t.Fatalf("%s status = %d, want %d", endpoint.path, response.Code, endpoint.wantStatus)
				}
				if got := response.Header().Get("Content-Security-Policy"); !strings.Contains(got, "frame-ancestors 'none'") {
					t.Errorf("%s CSP = %q", endpoint.path, got)
				}
				if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
					t.Errorf("%s X-Content-Type-Options = %q", endpoint.path, got)
				}
				if got := response.Header().Get("Strict-Transport-Security"); got != tt.wantHSTS {
					t.Errorf("%s HSTS = %q, want %q", endpoint.path, got, tt.wantHSTS)
				}
				requestID := response.Header().Get(httpx.RequestIDHeader)
				if _, err := uuid.Parse(requestID); err != nil {
					t.Errorf("%s request ID %q is not a UUID: %v", endpoint.path, requestID, err)
				}
				if requestID == "caller-request-id" {
					t.Errorf("%s retained the caller request ID", endpoint.path)
				}
			}
		})
	}
}

func TestRegisterHTTPRoutes(t *testing.T) {
	t.Parallel()

	r := chi.NewRouter()
	registerHTTPRoutes(r, api.Unimplemented{})

	routes := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/attempts"},
		{http.MethodPost, "/attempts"},
		{http.MethodGet, "/auth/exchange?code=test&binding=AAAAAAAAAAAAAAAAAAAAAA"},
		{http.MethodGet, "/auth/google"},
		{http.MethodGet, "/auth/google/bootstrap?request=test"},
		{http.MethodGet, "/auth/google/callback?state=test"},
		{http.MethodPost, "/auth/logout"},
		{http.MethodGet, "/me"},
		{http.MethodDelete, "/me"},
	}

	for _, prefix := range []string{"/v1", "/api/v1"} {
		for _, route := range routes {
			request := httptest.NewRequest(route.method, prefix+route.path, nil)
			response := httptest.NewRecorder()
			r.ServeHTTP(response, request)
			if response.Code != http.StatusNotImplemented {
				t.Fatalf("%s %s returned %d", route.method, request.URL, response.Code)
			}
		}
	}

	validationBodies := make([]string, 0, 2)
	for _, prefix := range []string{"/v1", "/api/v1"} {
		request := httptest.NewRequest(http.MethodGet, prefix+"/auth/exchange", nil)
		response := httptest.NewRecorder()
		r.ServeHTTP(response, request)
		if response.Code != http.StatusBadRequest {
			t.Fatalf("invalid %s request returned %d", prefix, response.Code)
		}
		validationBodies = append(validationBodies, response.Body.String())
	}
	if validationBodies[0] != validationBodies[1] {
		t.Fatal("route aliases returned different validation errors")
	}

	request := httptest.NewRequest(http.MethodGet, "/api/v1/unknown", nil)
	response := httptest.NewRecorder()
	r.ServeHTTP(response, request)
	if response.Code != http.StatusNotFound {
		t.Fatalf("unknown canonical route returned %d", response.Code)
	}
}
