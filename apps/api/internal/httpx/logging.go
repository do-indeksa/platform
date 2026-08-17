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

// RequestID creates a server-owned correlation ID and ignores caller input.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := uuid.NewString()
		w.Header().Set(RequestIDHeader, requestID)
		ctx := context.WithValue(r.Context(), middleware.RequestIDKey, requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequestLogger records only fixed metadata and matched route templates.
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
		"request_id", middleware.GetReqID(entry.request.Context()),
		"method", safeMethod(entry.request.Method),
		"route", matchedRoute(entry.request),
		"status", status,
		"bytes", bytes,
		"duration_ms", elapsed.Milliseconds(),
	)
}

func (entry *logEntry) Panic(_ any, stack []byte) {
	entry.logger.ErrorContext(entry.request.Context(), "http panic recovered",
		"request_id", middleware.GetReqID(entry.request.Context()),
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
