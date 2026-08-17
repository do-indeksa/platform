package httpx

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestLimitInFlightRejectsExcessAndReleasesSlot(t *testing.T) {
	entered := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	releaseFirst := func() {
		releaseOnce.Do(func() { close(release) })
	}
	t.Cleanup(releaseFirst)

	var calls atomic.Int32
	handler := LimitInFlight(1)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			close(entered)
			<-release
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	firstResponse := httptest.NewRecorder()
	firstDone := make(chan struct{})
	go func() {
		defer close(firstDone)
		handler.ServeHTTP(firstResponse, httptest.NewRequest(http.MethodGet, "/first", nil))
	}()

	select {
	case <-entered:
	case <-time.After(time.Second):
		t.Fatal("first request did not enter the protected handler")
	}

	overloadResponse := httptest.NewRecorder()
	overloadDone := make(chan struct{})
	go func() {
		defer close(overloadDone)
		handler.ServeHTTP(
			overloadResponse,
			httptest.NewRequest(http.MethodGet, "/overload", nil),
		)
	}()
	select {
	case <-overloadDone:
	case <-time.After(time.Second):
		t.Fatal("excess request queued instead of returning immediately")
	}
	if overloadResponse.Code != http.StatusServiceUnavailable {
		t.Fatalf("overload status = %d, want %d", overloadResponse.Code, http.StatusServiceUnavailable)
	}
	if got := overloadResponse.Header().Get("Retry-After"); got != "1" {
		t.Errorf("Retry-After = %q, want 1", got)
	}
	if got := overloadResponse.Header().Get("Content-Type"); got != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", got)
	}
	const wantBody = "{\"code\":\"server_busy\",\"message\":\"server is busy\"}\n"
	if got := overloadResponse.Body.String(); got != wantBody {
		t.Errorf("overload body = %q, want %q", got, wantBody)
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("protected handler calls during overload = %d, want 1", got)
	}

	releaseFirst()
	select {
	case <-firstDone:
	case <-time.After(time.Second):
		t.Fatal("first request did not finish after release")
	}
	if firstResponse.Code != http.StatusNoContent {
		t.Errorf("first request status = %d, want %d", firstResponse.Code, http.StatusNoContent)
	}

	afterReleaseResponse := httptest.NewRecorder()
	handler.ServeHTTP(
		afterReleaseResponse,
		httptest.NewRequest(http.MethodGet, "/after-release", nil),
	)
	if afterReleaseResponse.Code != http.StatusNoContent {
		t.Errorf(
			"request after release status = %d, want %d",
			afterReleaseResponse.Code,
			http.StatusNoContent,
		)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("protected handler calls after release = %d, want 2", got)
	}
}

func TestLimitInFlightReleasesSlotAfterPanic(t *testing.T) {
	var calls atomic.Int32
	handler := LimitInFlight(1)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if calls.Add(1) == 1 {
			panic("test panic")
		}
		w.WriteHeader(http.StatusNoContent)
	}))

	panicked := false
	func() {
		defer func() {
			panicked = recover() != nil
		}()
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/panic", nil))
	}()
	if !panicked {
		t.Fatal("protected handler panic was not propagated")
	}

	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/after-panic", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("request after panic status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("protected handler calls = %d, want 2", got)
	}
}

func TestLimitInFlightRejectsNonPositiveLimit(t *testing.T) {
	for name, limit := range map[string]int{"zero": 0, "negative": -1} {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatalf("LimitInFlight(%d) did not panic", limit)
				}
			}()

			_ = LimitInFlight(limit)
		})
	}
}
