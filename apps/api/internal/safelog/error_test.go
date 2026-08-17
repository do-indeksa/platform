package safelog

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestErrorClassifiesWithoutRenderingDetails(t *testing.T) {
	tests := []struct {
		name         string
		err          error
		wantKind     string
		wantSQLState string
	}{
		{name: "nil", wantKind: "none"},
		{
			name:     "internal",
			err:      unrenderableCanaryError{},
			wantKind: "internal",
		},
		{
			name:     "wrapped deadline",
			err:      fmt.Errorf("deadline-wrapper-secret: %w", context.DeadlineExceeded),
			wantKind: "deadline_exceeded",
		},
		{
			name:     "wrapped cancellation",
			err:      fmt.Errorf("cancellation-wrapper-secret: %w", context.Canceled),
			wantKind: "canceled",
		},
		{
			name: "postgres server",
			err: fmt.Errorf("postgres-wrapper-secret: %w", &pgconn.PgError{
				Code:    "23505",
				Message: "postgres-message-secret",
				Detail:  "postgres-detail-secret",
			}),
			wantKind:     "postgres",
			wantSQLState: "23505",
		},
		{
			name: "postgres connect",
			err: &pgconn.ConnectError{Config: &pgconn.Config{
				User:     "database-user-secret",
				Database: "database-name-secret",
				Host:     "database-host-secret",
			}},
			wantKind: "postgres_connect",
		},
		{
			name: "postgres invalid sqlstate",
			err: &pgconn.PgError{
				Code:    "23a05",
				Message: "postgres-invalid-code-secret",
			},
			wantKind: "postgres",
		},
		{
			name:     "postgres connection closed",
			err:      fmt.Errorf("postgres-close-secret: %w", pgconn.ErrConnClosed),
			wantKind: "postgres_connection_closed",
		},
		{
			name: "network",
			err: &net.DNSError{
				Err:  "network-error-secret",
				Name: "origin-host-secret",
			},
			wantKind: "network",
		},
		{
			name: "network timeout",
			err: &net.DNSError{
				Err:       "network-timeout-secret",
				Name:      "timeout-host-secret",
				IsTimeout: true,
			},
			wantKind: "network_timeout",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var output bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&output, nil))

			logger.Error("operation failed", Error(tt.err))

			var entry map[string]any
			if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
				t.Fatalf("decode safe log: %v", err)
			}
			errorGroup, ok := entry["error"].(map[string]any)
			if !ok {
				t.Fatalf("error attribute = %#v, want group", entry["error"])
			}
			if errorGroup["kind"] != tt.wantKind {
				t.Fatalf("error kind = %#v, want %q", errorGroup["kind"], tt.wantKind)
			}
			if tt.wantSQLState == "" {
				if _, exists := errorGroup["sqlstate"]; exists {
					t.Fatalf("unexpected SQLSTATE in %#v", errorGroup)
				}
			} else if errorGroup["sqlstate"] != tt.wantSQLState {
				t.Fatalf("SQLSTATE = %#v, want %q", errorGroup["sqlstate"], tt.wantSQLState)
			}
			wantFields := 1
			if tt.wantSQLState != "" {
				wantFields++
			}
			if len(errorGroup) != wantFields {
				t.Errorf("error group contains unexpected fields: %#v", errorGroup)
			}

			logs := output.String()
			for _, marker := range []string{
				"unrenderableCanaryError",
				"deadline-wrapper-secret",
				"cancellation-wrapper-secret",
				"postgres-message-secret",
				"postgres-detail-secret",
				"postgres-wrapper-secret",
				"23a05",
				"postgres-invalid-code-secret",
				"database-user-secret",
				"database-name-secret",
				"database-host-secret",
				"postgres-close-secret",
				"network-error-secret",
				"origin-host-secret",
				"network-timeout-secret",
				"timeout-host-secret",
			} {
				if strings.Contains(logs, marker) {
					t.Errorf("safe log contains marker %q: %s", marker, logs)
				}
			}
		})
	}
}

type unrenderableCanaryError struct{}

func (unrenderableCanaryError) Error() string {
	panic(errors.New("error-render-secret"))
}
