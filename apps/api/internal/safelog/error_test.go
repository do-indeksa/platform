package safelog

import (
	"bytes"
	"context"
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
		{
			name:     "nil",
			wantKind: "none",
		},
		{
			name:     "internal",
			err:      errors.New("internal-error-secret"),
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
				Code:    "23sqlstate-secret",
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

			logs := output.String()
			if !strings.Contains(logs, `"error":{"kind":"`+tt.wantKind+`"`) {
				t.Fatalf("safe log %q does not contain kind %q", logs, tt.wantKind)
			}
			if tt.wantSQLState != "" &&
				!strings.Contains(logs, `"sqlstate":"`+tt.wantSQLState+`"`) {
				t.Fatalf("safe log %q does not contain SQLSTATE %q", logs, tt.wantSQLState)
			}
			if tt.wantSQLState == "" && strings.Contains(logs, `"sqlstate":`) {
				t.Fatalf("safe log %q contains an unexpected SQLSTATE", logs)
			}
			for _, marker := range []string{
				"internal-error-secret",
				"deadline-wrapper-secret",
				"cancellation-wrapper-secret",
				"postgres-message-secret",
				"postgres-detail-secret",
				"postgres-wrapper-secret",
				"23sqlstate-secret",
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
