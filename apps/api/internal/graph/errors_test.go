package graph

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

func TestGraphQLRecoveryDoesNotLogPanicValue(t *testing.T) {
	var output bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })

	handler := httpx.ServerRequestID(middleware.RequestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		err := recoverError(r.Context(), "graphql-panic-secret")
		if !strings.Contains(err.Error(), "internal server error") {
			t.Fatalf("recovery error = %q", err)
		}
		w.WriteHeader(http.StatusInternalServerError)
	})))
	request := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	logs := output.String()
	if strings.Contains(logs, "graphql-panic-secret") {
		t.Fatalf("logs contain GraphQL panic value: %s", logs)
	}
	if !strings.Contains(logs, `"msg":"graphql panic recovered"`) {
		t.Fatalf("logs do not identify GraphQL recovery: %s", logs)
	}
	requestID := response.Header().Get("X-Request-ID")
	if requestID == "" || !strings.Contains(logs, requestID) {
		t.Fatalf("logs do not correlate request ID %q: %s", requestID, logs)
	}
	if !strings.Contains(logs, `"stack":`) {
		t.Fatalf("logs do not include a recovery stack: %s", logs)
	}
}
