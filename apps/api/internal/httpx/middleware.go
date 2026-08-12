package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"
)

const (
	RequestIDHeader = "X-Request-ID"
	unmatchedRoute  = "<unmatched>"
)

// ServerRequestID replaces any caller-provided request ID before chi reads it.
func ServerRequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := uuid.NewString()
		r.Header.Set(middleware.RequestIDHeader, requestID)
		w.Header().Set(RequestIDHeader, requestID)
		next.ServeHTTP(w, r)
	})
}

func RequestIDFromContext(ctx context.Context) string {
	return middleware.GetReqID(ctx)
}

// RequestLogger is a chi logger hook whose output is restricted to fixed fields.
func RequestLogger(logger *slog.Logger) func(http.Handler) http.Handler {
	return middleware.RequestLogger(&logFormatter{logger: logger})
}

type logFormatter struct {
	logger *slog.Logger
}

func (formatter *logFormatter) NewLogEntry(r *http.Request) middleware.LogEntry {
	return &logEntry{logger: formatter.logger, request: r}
}

type logEntry struct {
	logger  *slog.Logger
	request *http.Request
}

func (entry *logEntry) Write(status, bytes int, _ http.Header, elapsed time.Duration, _ any) {
	if status == 0 {
		status = http.StatusOK
	}
	entry.logger.InfoContext(entry.request.Context(), "http request",
		"request_id", RequestIDFromContext(entry.request.Context()),
		"method", safeMethod(entry.request.Method),
		"route", matchedRoute(entry.request),
		"status", status,
		"bytes", bytes,
		"duration_ms", elapsed.Milliseconds(),
	)
}

func (entry *logEntry) Panic(_ any, stack []byte) {
	entry.logger.ErrorContext(entry.request.Context(), "http panic recovered",
		"request_id", RequestIDFromContext(entry.request.Context()),
		"stack", string(stack),
	)
}

func matchedRoute(r *http.Request) string {
	routeContext := chi.RouteContext(r.Context())
	if routeContext == nil {
		return unmatchedRoute
	}
	if pattern := routeContext.RoutePattern(); pattern != "" {
		return pattern
	}
	return unmatchedRoute
}

func safeMethod(method string) string {
	switch method {
	case http.MethodConnect,
		http.MethodDelete,
		http.MethodGet,
		http.MethodHead,
		http.MethodOptions,
		http.MethodPatch,
		http.MethodPost,
		http.MethodPut,
		http.MethodTrace:
		return method
	default:
		return "OTHER"
	}
}
