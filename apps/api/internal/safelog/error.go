package safelog

import (
	"context"
	"errors"
	"log/slog"
	"net"

	"github.com/jackc/pgx/v5/pgconn"
)

// Error returns a structured classification without rendering the source error.
func Error(err error) slog.Attr {
	kind, sqlState := classifyError(err)
	attributes := []slog.Attr{slog.String("kind", kind)}
	if sqlState != "" {
		attributes = append(attributes, slog.String("sqlstate", sqlState))
	}
	return slog.Attr{Key: "error", Value: slog.GroupValue(attributes...)}
}

func classifyError(err error) (string, string) {
	switch {
	case err == nil:
		return "none", ""
	case errors.Is(err, context.Canceled):
		return "canceled", ""
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline_exceeded", ""
	}

	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		if validSQLState(postgresError.Code) {
			return "postgres", postgresError.Code
		}
		return "postgres", ""
	}
	var connectError *pgconn.ConnectError
	if errors.As(err, &connectError) {
		return "postgres_connect", ""
	}
	if errors.Is(err, pgconn.ErrConnClosed) {
		return "postgres_connection_closed", ""
	}
	var networkError net.Error
	if errors.As(err, &networkError) {
		if networkError.Timeout() {
			return "network_timeout", ""
		}
		return "network", ""
	}
	return "internal", ""
}

func validSQLState(code string) bool {
	if len(code) != 5 {
		return false
	}
	for _, character := range code {
		if (character < '0' || character > '9') && (character < 'A' || character > 'Z') {
			return false
		}
	}
	return true
}
