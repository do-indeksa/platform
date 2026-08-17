package main

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

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
	var logs bytes.Buffer
	router := newRouter(
		auth.NewService(nil, auth.Config{}),
		server,
		http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			graphCalls.Add(1)
			w.WriteHeader(http.StatusNoContent)
		}),
		func(context.Context) error { return nil },
		1,
		slog.New(slog.NewJSONHandler(&logs, nil)),
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
	case <-time.After(time.Second):
		t.Fatal("first application request did not enter the handler")
	}

	const wantBody = "{\"code\":\"server_busy\",\"message\":\"server is busy\"}\n"
	assertOverload := func(path string) *httptest.ResponseRecorder {
		t.Helper()
		response := httptest.NewRecorder()
		done := make(chan struct{})
		go func() {
			defer close(done)
			router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		}()
		select {
		case <-done:
		case <-time.After(time.Second):
			t.Fatalf("saturated router queued excess request to %s", path)
		}
		if response.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s overload status = %d, want %d", path, response.Code, http.StatusServiceUnavailable)
		}
		if got := response.Header().Get("Retry-After"); got != "1" {
			t.Errorf("%s Retry-After = %q, want 1", path, got)
		}
		if got := response.Header().Get("Content-Type"); got != "application/json" {
			t.Errorf("%s Content-Type = %q, want application/json", path, got)
		}
		if got := response.Header().Get(httpx.RequestIDHeader); got == "" {
			t.Errorf("%s response is missing X-Request-ID", path)
		}
		if got := response.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Errorf("%s X-Content-Type-Options = %q, want nosniff", path, got)
		}
		if got := response.Header().Get("Cache-Control"); got == "" {
			t.Errorf("%s response is missing Cache-Control", path)
		}
		if got := response.Body.String(); got != wantBody {
			t.Errorf("%s overload body = %q, want %q", path, got, wantBody)
		}
		return response
	}

	overloadResponse := assertOverload("/graphql")
	if got := server.calls.Load(); got != 1 {
		t.Fatalf("application handler calls during overload = %d, want 1", got)
	}
	if got := graphCalls.Load(); got != 0 {
		t.Fatalf("GraphQL handler calls during overload = %d, want 0", got)
	}

	var accessRecord map[string]any
	if err := json.NewDecoder(&logs).Decode(&accessRecord); err != nil {
		t.Fatalf("decode overload access log: %v", err)
	}
	if accessRecord["status"] != float64(http.StatusServiceUnavailable) ||
		accessRecord["route"] != "/graphql" ||
		accessRecord["request_id"] != overloadResponse.Header().Get(httpx.RequestIDHeader) {
		t.Errorf("unexpected overload access record: %#v", accessRecord)
	}

	assertOverload("/api/v1/auth/google")
	assertOverload("/v1/me")
	if got := server.calls.Load(); got != 1 {
		t.Fatalf("REST handler calls during overload = %d, want 1", got)
	}

	unsafeRequest := httptest.NewRequest(http.MethodPost, "/api/v1/auth/logout", nil)
	unsafeRequest.Header.Set("Sec-Fetch-Site", "cross-site")
	unsafeResponse := httptest.NewRecorder()
	router.ServeHTTP(unsafeResponse, unsafeRequest)
	if unsafeResponse.Code != http.StatusForbidden {
		t.Errorf("unsafe request during saturation = %d, want 403", unsafeResponse.Code)
	}
	if got := unsafeResponse.Header().Get("Retry-After"); got != "" {
		t.Errorf("unsafe request reached limiter; Retry-After = %q", got)
	}

	for _, path := range []string{"/healthz", "/readyz"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, path, nil))
		if response.Code != http.StatusOK {
			t.Errorf(
				"%s status during application saturation = %d, want %d",
				path,
				response.Code,
				http.StatusOK,
			)
		}
	}

	releaseFirst()
	select {
	case <-firstDone:
	case <-time.After(time.Second):
		t.Fatal("first application request did not finish after release")
	}
	if firstResponse.Code != http.StatusNoContent {
		t.Errorf(
			"first application request status = %d, want %d",
			firstResponse.Code,
			http.StatusNoContent,
		)
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
}
