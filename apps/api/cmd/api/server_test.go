package main

import (
	"errors"
	"io"
	"net"
	"net/http"
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

func TestHTTPServerRejectsOversizedRequestTargetsBeforeHandler(t *testing.T) {
	var handlerCalls atomic.Int32
	handler := http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		handlerCalls.Add(1)
		w.WriteHeader(http.StatusNoContent)
	})
	baseURL := startTestHTTPServer(t, handler)
	client := &http.Client{Timeout: 2 * time.Second}

	ordinaryTarget := "/v1/auth/google/callback?code=" + strings.Repeat("c", 4096) +
		"&state=" + strings.Repeat("s", 4096)
	response, err := client.Get(baseURL + ordinaryTarget)
	if err != nil {
		t.Fatal(err)
	}
	closeResponse(t, response)
	if response.StatusCode != http.StatusNoContent || handlerCalls.Load() != 1 {
		t.Fatalf("ordinary request returned %d with %d handler calls", response.StatusCode, handlerCalls.Load())
	}

	atLimitTarget := "/" + strings.Repeat("x", maxRequestTargetBytes-1)
	response, err = client.Get(baseURL + atLimitTarget)
	if err != nil {
		t.Fatal(err)
	}
	closeResponse(t, response)
	if response.StatusCode != http.StatusNoContent || handlerCalls.Load() != 2 {
		t.Fatalf("request target at limit returned %d with %d handler calls", response.StatusCode, handlerCalls.Load())
	}

	oversizedPrefix := "/healthz?value="
	oversizedTarget := oversizedPrefix +
		strings.Repeat("x", maxRequestTargetBytes-len(oversizedPrefix)+1)
	response, err = client.Get(baseURL + oversizedTarget)
	if err != nil {
		t.Fatal(err)
	}
	closeResponse(t, response)
	if response.StatusCode != http.StatusRequestURITooLong {
		t.Errorf("oversized request target returned %d, want 414", response.StatusCode)
	}
	if handlerCalls.Load() != 2 {
		t.Errorf("oversized request target reached handler; calls = %d", handlerCalls.Load())
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
