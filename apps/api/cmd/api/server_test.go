package main

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestNewHTTPServerConfiguresRuntimeBounds(t *testing.T) {
	handler := http.NewServeMux()
	server := newHTTPServer(":9876", handler)

	if server.Addr != ":9876" {
		t.Errorf("address = %q, want :9876", server.Addr)
	}
	for name, value := range map[string]struct {
		got  time.Duration
		want time.Duration
	}{
		"read header": {got: server.ReadHeaderTimeout, want: 5 * time.Second},
		"read":        {got: server.ReadTimeout, want: 10 * time.Second},
		"write":       {got: server.WriteTimeout, want: 30 * time.Second},
		"idle":        {got: server.IdleTimeout, want: time.Minute},
	} {
		if value.got != value.want {
			t.Errorf("%s timeout = %v, want %v", name, value.got, value.want)
		}
	}
	if server.MaxHeaderBytes != maxRequestHeaderBytes {
		t.Errorf("MaxHeaderBytes = %d, want %d", server.MaxHeaderBytes, maxRequestHeaderBytes)
	}
	if requestExecutionTimeout != 20*time.Second {
		t.Errorf("request execution timeout = %v, want 20s", requestExecutionTimeout)
	}
	if gracefulShutdownTimeout != 30*time.Second {
		t.Errorf("graceful shutdown timeout = %v, want 30s", gracefulShutdownTimeout)
	}
	if requestExecutionTimeout >= server.WriteTimeout || server.WriteTimeout > gracefulShutdownTimeout {
		t.Errorf(
			"request, write, and shutdown budgets are not ordered: %v, %v, %v",
			requestExecutionTimeout,
			server.WriteTimeout,
			gracefulShutdownTimeout,
		)
	}
}

func TestRequestDeadlineBoundsHandlerExecution(t *testing.T) {
	const timeout = 20 * time.Millisecond
	type observation struct {
		err       error
		remaining time.Duration
	}
	observed := make(chan observation, 1)
	done := make(chan struct{})
	handler := withRequestDeadline(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		deadline, ok := r.Context().Deadline()
		remaining := time.Duration(-1)
		if ok {
			remaining = time.Until(deadline)
		}
		<-r.Context().Done()
		observed <- observation{err: r.Context().Err(), remaining: remaining}
		w.WriteHeader(http.StatusGatewayTimeout)
	}), timeout)
	response := httptest.NewRecorder()

	go func() {
		handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/graphql", nil))
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("handler did not stop at the request deadline")
	}
	result := <-observed
	if !errors.Is(result.err, context.DeadlineExceeded) {
		t.Fatalf("handler context error = %v, want deadline exceeded", result.err)
	}
	if result.remaining <= 0 || result.remaining > timeout {
		t.Fatalf("handler deadline remaining = %v, want within (0, %v]", result.remaining, timeout)
	}
	if response.Code != http.StatusGatewayTimeout {
		t.Fatalf("handler status = %d, want 504", response.Code)
	}
}

func TestRequestDeadlinePreservesEarlierCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	started := make(chan struct{})
	observed := make(chan error, 1)
	done := make(chan struct{})
	handler := withRequestDeadline(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-r.Context().Done()
		observed <- r.Context().Err()
		w.WriteHeader(http.StatusNoContent)
	}), time.Minute)
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil).WithContext(ctx)

	go func() {
		handler.ServeHTTP(httptest.NewRecorder(), request)
		close(done)
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("handler did not start")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("handler did not stop after parent cancellation")
	}
	if err := <-observed; !errors.Is(err, context.Canceled) {
		t.Fatalf("handler context error = %v, want parent cancellation", err)
	}
}

func TestHTTPServerPropagatesRequestDeadline(t *testing.T) {
	deadlineRemaining := make(chan time.Duration, 1)
	baseURL := startTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		deadline, ok := r.Context().Deadline()
		if !ok {
			deadlineRemaining <- -1
		} else {
			deadlineRemaining <- time.Until(deadline)
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	response, err := (&http.Client{Timeout: time.Second}).Get(baseURL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	closeResponse(t, response)
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("request returned %d, want 204", response.StatusCode)
	}
	remaining := <-deadlineRemaining
	if remaining <= 0 || remaining > requestExecutionTimeout {
		t.Fatalf(
			"request deadline remaining = %v, want within (0, %v]",
			remaining,
			requestExecutionTimeout,
		)
	}
}

func TestHTTPServerRejectsOversizedHeadersBeforeHandler(t *testing.T) {
	var handlerCalls atomic.Int32
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		handlerCalls.Add(1)
		w.WriteHeader(http.StatusNoContent)
	})
	baseURL := startTestHTTPServer(t, handler)
	client := &http.Client{Timeout: 2 * time.Second}
	url := baseURL + "/healthz"
	response, err := client.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	closeResponse(t, response)
	if response.StatusCode != http.StatusNoContent || handlerCalls.Load() != 1 {
		t.Fatalf("ordinary request returned %d with %d handler calls", response.StatusCode, handlerCalls.Load())
	}

	request, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("X-Oversized", strings.Repeat("x", 2*maxRequestHeaderBytes))
	response, err = client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	closeResponse(t, response)
	if response.StatusCode != http.StatusRequestHeaderFieldsTooLarge {
		t.Errorf("oversized request returned %d, want 431", response.StatusCode)
	}
	if handlerCalls.Load() != 1 {
		t.Errorf("oversized request reached handler; calls = %d", handlerCalls.Load())
	}
}

func startTestHTTPServer(t *testing.T, handler http.Handler) string {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	server := newHTTPServer(listener.Addr().String(), handler)
	serveErrors := make(chan error, 1)
	go func() {
		serveErrors <- server.Serve(listener)
	}()
	t.Cleanup(func() {
		if err := server.Close(); err != nil {
			t.Errorf("close server: %v", err)
		}
		if err := <-serveErrors; !errors.Is(err, http.ErrServerClosed) {
			t.Errorf("serve returned %v, want http.ErrServerClosed", err)
		}
	})
	return "http://" + listener.Addr().String()
}

func closeResponse(t *testing.T, response *http.Response) {
	t.Helper()
	_, _ = io.Copy(io.Discard, response.Body)
	if err := response.Body.Close(); err != nil {
		t.Errorf("close response body: %v", err)
	}
}
