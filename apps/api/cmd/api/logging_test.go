package main

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

func TestRequestLoggingUsesOnlyAllowlistedMetadata(t *testing.T) {
	var output bytes.Buffer
	router := loggedTestRouter(slog.New(slog.NewJSONHandler(&output, nil)))
	router.Get("/api/v1/auth/google/callback", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusFound)
	})
	router.Post("/graphql", func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte("response-body-secret"))
	})
	router.Get("/resource/{id}", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})
	router.Get("/silent", func(http.ResponseWriter, *http.Request) {})
	router.Get("/panic", func(http.ResponseWriter, *http.Request) {
		panic("panic-value-secret")
	})

	requests := []struct {
		method string
		target string
		body   string
		status int
	}{
		{method: http.MethodGet, target: "/silent", status: http.StatusOK},
		{
			method: http.MethodGet,
			target: "/resource/path-param-secret?value=query-param-secret",
			status: http.StatusNoContent,
		},
		{
			method: http.MethodGet,
			target: "/api/v1/auth/google/callback?code=oauth-code-secret&state=oauth-state-secret",
			status: http.StatusFound,
		},
		{
			method: http.MethodPost,
			target: "/graphql?operationName=query-name-secret",
			body:   `{"query":"body-secret"}`,
			status: http.StatusOK,
		},
		{
			method: http.MethodGet,
			target: "/unmatched/path-secret?code=handoff-code-secret",
			status: http.StatusNotFound,
		},
		{
			method: http.MethodGet,
			target: "/panic?state=panic-query-secret",
			status: http.StatusInternalServerError,
		},
	}

	responseIDs := make([]string, 0, len(requests))
	seenResponseIDs := make(map[string]struct{}, len(requests))
	for _, testRequest := range requests {
		request := httptest.NewRequest(testRequest.method, testRequest.target, strings.NewReader(testRequest.body))
		request.Host = "host-secret.example"
		request.RemoteAddr = "remote-address-secret"
		request.Header.Set("Authorization", "Bearer authorization-secret")
		request.Header.Set("Cookie", "di_session=cookie-secret")
		request.Header.Set("X-Request-ID", "caller-request-id-secret")
		response := httptest.NewRecorder()

		router.ServeHTTP(response, request)

		if response.Code != testRequest.status {
			t.Fatalf("%s %s returned %d, want %d", testRequest.method, testRequest.target, response.Code, testRequest.status)
		}
		requestID := response.Header().Get(httpx.RequestIDHeader)
		if _, err := uuid.Parse(requestID); err != nil {
			t.Fatalf("response request ID %q is not a UUID: %v", requestID, err)
		}
		if _, duplicate := seenResponseIDs[requestID]; duplicate {
			t.Fatalf("duplicate response request ID %q", requestID)
		}
		seenResponseIDs[requestID] = struct{}{}
		responseIDs = append(responseIDs, requestID)
	}

	logs := output.String()
	for _, secret := range []string{
		"oauth-code-secret",
		"oauth-state-secret",
		"query-name-secret",
		"body-secret",
		"response-body-secret",
		"path-param-secret",
		"query-param-secret",
		"path-secret",
		"handoff-code-secret",
		"panic-query-secret",
		"panic-value-secret",
		"host-secret",
		"remote-address-secret",
		"authorization-secret",
		"cookie-secret",
		"caller-request-id-secret",
	} {
		if strings.Contains(logs, secret) {
			t.Errorf("logs contain sensitive marker %q: %s", secret, logs)
		}
	}

	entries := decodeLogEntries(t, logs)
	if len(entries) != 7 {
		t.Fatalf("got %d log entries, want six access entries and one recovery entry: %s", len(entries), logs)
	}
	assertAccessLog(t, entries[0], http.MethodGet, "/silent", http.StatusOK)
	assertAccessLog(t, entries[1], http.MethodGet, "/resource/{id}", http.StatusNoContent)
	assertAccessLog(t, entries[2], http.MethodGet, "/api/v1/auth/google/callback", http.StatusFound)
	assertAccessLog(t, entries[3], http.MethodPost, "/graphql", http.StatusOK)
	assertAccessLog(t, entries[4], http.MethodGet, "<unmatched>", http.StatusNotFound)
	for _, entry := range entries[:5] {
		assertLogKeys(t, entry,
			"time", "level", "msg", "request_id", "method", "route", "status", "bytes", "duration_ms",
		)
	}
	for index := range 5 {
		assertRequestID(t, entries[index], responseIDs[index])
	}
	if entries[5]["msg"] != "http panic recovered" {
		t.Fatalf("entry 5 message = %v, want panic recovery", entries[5]["msg"])
	}
	if _, ok := entries[5]["stack"].(string); !ok {
		t.Fatalf("panic entry does not include a stack: %#v", entries[5])
	}
	assertLogKeys(t, entries[5], "time", "level", "msg", "request_id", "stack")
	assertRequestID(t, entries[5], responseIDs[5])
	assertAccessLog(t, entries[6], http.MethodGet, "/panic", http.StatusInternalServerError)
	assertLogKeys(t, entries[6],
		"time", "level", "msg", "request_id", "method", "route", "status", "bytes", "duration_ms",
	)
	assertRequestID(t, entries[6], responseIDs[5])
}

func TestRequestLoggingNormalizesUnknownMethods(t *testing.T) {
	var output bytes.Buffer
	router := loggedTestRouter(slog.New(slog.NewJSONHandler(&output, nil)))
	router.HandleFunc("/method", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	request := httptest.NewRequest("METHOD-SECRET", "/method", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	logs := output.String()
	if strings.Contains(logs, "METHOD-SECRET") {
		t.Fatalf("logs contain untrusted method: %s", logs)
	}
	entries := decodeLogEntries(t, logs)
	assertAccessLog(t, entries[0], "OTHER", "<unmatched>", http.StatusMethodNotAllowed)
}

func loggedTestRouter(logger *slog.Logger) *chi.Mux {
	router := chi.NewRouter()
	router.Use(httpx.RequestID, httpx.RequestLogger(logger), middleware.Recoverer, middleware.NoCache)
	return router
}

func decodeLogEntries(t *testing.T, logs string) []map[string]any {
	t.Helper()
	lines := strings.Split(strings.TrimSpace(logs), "\n")
	entries := make([]map[string]any, 0, len(lines))
	for _, line := range lines {
		var entry map[string]any
		if err := json.Unmarshal([]byte(line), &entry); err != nil {
			t.Fatalf("decode log entry %q: %v", line, err)
		}
		entries = append(entries, entry)
	}
	return entries
}

func assertAccessLog(t *testing.T, entry map[string]any, method, route string, status int) {
	t.Helper()
	for key, want := range map[string]any{
		"msg":    "http request",
		"method": method,
		"route":  route,
		"status": float64(status),
	} {
		if got := entry[key]; got != want {
			t.Errorf("%s = %#v, want %#v in entry %#v", key, got, want, entry)
		}
	}
	for _, key := range []string{"request_id", "bytes", "duration_ms"} {
		if _, exists := entry[key]; !exists {
			t.Errorf("entry is missing %q: %#v", key, entry)
		}
	}
}

func assertLogKeys(t *testing.T, entry map[string]any, keys ...string) {
	t.Helper()
	allowed := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		allowed[key] = struct{}{}
	}
	for key := range entry {
		if _, ok := allowed[key]; !ok {
			t.Errorf("log entry contains unexpected field %q: %#v", key, entry)
		}
	}
}

func assertRequestID(t *testing.T, entry map[string]any, want string) {
	t.Helper()
	if got := entry["request_id"]; got != want {
		t.Errorf("request_id = %#v, want %#v in entry %#v", got, want, entry)
	}
}
