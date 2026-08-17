package graph

import (
	"bytes"
	"context"
	"encoding/json"
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

	var entry map[string]any
	if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
		t.Fatalf("decode GraphQL recovery log: %v", err)
	}
	if strings.Contains(output.String(), "graphql-panic-secret") {
		t.Fatalf("logs contain GraphQL panic value: %s", output.String())
	}
	if entry["msg"] != "graphql panic recovered" {
		t.Fatalf("recovery message = %#v", entry["msg"])
	}
	if entry["request_id"] != "request-id" {
		t.Fatalf("request ID = %#v", entry["request_id"])
	}
	if _, ok := entry["stack"].(string); !ok {
		t.Fatalf("recovery entry does not include a stack: %#v", entry)
	}
	allowed := map[string]bool{
		"time": true, "level": true, "msg": true, "request_id": true, "stack": true,
	}
	for key := range entry {
		if !allowed[key] {
			t.Errorf("recovery entry contains unexpected field %q: %#v", key, entry)
		}
	}
}
