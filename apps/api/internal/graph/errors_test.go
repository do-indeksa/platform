package graph

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5/middleware"
)

func TestGraphQLRecoveryDoesNotLogPanicValue(t *testing.T) {
	var output bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })

	ctx := context.WithValue(context.Background(), middleware.RequestIDKey, "request-id")
	err := recoverError(ctx, "graphql-panic-secret")
	if !strings.Contains(err.Error(), "internal server error") {
		t.Fatalf("recovery error = %q", err)
	}

	logs := output.String()
	if strings.Contains(logs, "graphql-panic-secret") {
		t.Fatalf("logs contain GraphQL panic value: %s", logs)
	}
	if !strings.Contains(logs, `"msg":"graphql panic recovered"`) {
		t.Fatalf("logs do not identify GraphQL recovery: %s", logs)
	}
	if !strings.Contains(logs, `"request_id":"request-id"`) {
		t.Fatalf("logs do not correlate the request ID: %s", logs)
	}
	if !strings.Contains(logs, `"stack":`) {
		t.Fatalf("logs do not include a recovery stack: %s", logs)
	}
}
