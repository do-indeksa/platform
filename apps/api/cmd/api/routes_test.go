package main

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
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
			}
		})
	}
}

type blockingAPIServer struct {
	api.Unimplemented
	entered chan struct{}
	release <-chan struct{}
	calls   atomic.Int32
}

func (server *blockingAPIServer) GetMe(w http.ResponseWriter, _ *http.Request) {
	if server.calls.Add(1) == 1 {
		close(server.entered)
		<-server.release
	}
	w.WriteHeader(http.StatusNoContent)
}

func TestRouterReservesProbesDuringApplicationSaturation(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseFirst := func() {
		releaseOnce.Do(func() { close(release) })
	}
	t.Cleanup(releaseFirst)

	server := &blockingAPIServer{entered: entered, release: release}
	var graphCalls atomic.Int32
	router := newRouter(
		auth.NewService(nil, auth.Config{}),
		server,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			graphCalls.Add(1)
			w.WriteHeader(http.StatusNoContent)
		}),
		func(context.Context) error { return nil },
		1,
		slog.New(slog.NewTextHandler(io.Discard, nil)),
		false,
	)

	firstResponse := httptest.NewRecorder()
	firstDone := make(chan struct{})
	go func() {
		defer close(firstDone)
		router.ServeHTTP(
			firstResponse,
			httptest.NewRequest(http.MethodGet, "/api/v1/me", nil),
		)
	}()

	select {
	case <-entered:
	case <-time.After(5 * time.Second):
		t.Fatal("first application request did not enter the handler")
	}

	overloadResponse := httptest.NewRecorder()
	router.ServeHTTP(
		overloadResponse,
		httptest.NewRequest(http.MethodGet, "/graphql", nil),
	)
	if overloadResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("overload status = %d, want %d", overloadResponse.Code, http.StatusServiceUnavailable)
	}
	if got := overloadResponse.Header().Get("Retry-After"); got != "1" {
		t.Errorf("Retry-After = %q, want 1", got)
	}
	if got := overloadResponse.Header().Get("X-Request-ID"); got == "" {
		t.Error("overload response is missing X-Request-ID")
	}
	if got := overloadResponse.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Errorf("overload X-Content-Type-Options = %q", got)
	}
	const wantBody = "{\"code\":\"server_busy\",\"message\":\"server is busy\"}\n"
	if got := overloadResponse.Body.String(); got != wantBody {
		t.Errorf("overload body = %q, want %q", got, wantBody)
	}
	if got := server.calls.Load(); got != 1 {
		t.Fatalf("application handler calls during overload = %d, want 1", got)
	}
	if got := graphCalls.Load(); got != 0 {
		t.Fatalf("GraphQL handler calls during overload = %d, want 0", got)
	}

	for _, path := range []string{"/healthz", "/readyz"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Errorf("%s status during application saturation = %d, want %d", path, response.Code, http.StatusOK)
		}
	}

	releaseFirst()
	select {
	case <-firstDone:
	case <-time.After(5 * time.Second):
		t.Fatal("first application request did not finish after release")
	}
	if firstResponse.Code != http.StatusNoContent {
		t.Errorf("first application request status = %d, want %d", firstResponse.Code, http.StatusNoContent)
	}

	graphResponse := httptest.NewRecorder()
	router.ServeHTTP(
		graphResponse,
		httptest.NewRequest(http.MethodGet, "/graphql", nil),
	)
	if graphResponse.Code != http.StatusNoContent {
		t.Errorf("GraphQL status after release = %d, want %d", graphResponse.Code, http.StatusNoContent)
	}
	if got := graphCalls.Load(); got != 1 {
		t.Errorf("GraphQL handler calls after release = %d, want 1", got)
	}

	afterReleaseResponse := httptest.NewRecorder()
	router.ServeHTTP(
		afterReleaseResponse,
		httptest.NewRequest(http.MethodGet, "/api/v1/me", nil),
	)
	if afterReleaseResponse.Code != http.StatusNoContent {
		t.Errorf(
			"application request after release status = %d, want %d",
			afterReleaseResponse.Code,
			http.StatusNoContent,
		)
	}
	if got := server.calls.Load(); got != 2 {
		t.Errorf("application handler calls after release = %d, want 2", got)
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
