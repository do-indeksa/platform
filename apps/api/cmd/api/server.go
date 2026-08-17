package main

import (
	"context"
	"log/slog"
	"net/http"
	"time"
)

const (
	maxRequestHeaderBytes   = 128 << 10
	maxRequestTargetBytes   = 16 << 10
	requestExecutionTimeout = 20 * time.Second
	serverWriteTimeout      = 30 * time.Second
	gracefulShutdownTimeout = 30 * time.Second
)

func newHTTPServer(address string, handler http.Handler, logger *slog.Logger) *http.Server {
	return &http.Server{
		Addr:              address,
		Handler:           limitRequestTarget(withRequestDeadline(handler, requestExecutionTimeout)),
		ErrorLog:          newHTTPServerErrorLog(logger),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      serverWriteTimeout,
		IdleTimeout:       time.Minute,
		MaxHeaderBytes:    maxRequestHeaderBytes,
	}
}

func limitRequestTarget(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.RequestURI) > maxRequestTargetBytes {
			http.Error(w, http.StatusText(http.StatusRequestURITooLong), http.StatusRequestURITooLong)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func withRequestDeadline(next http.Handler, timeout time.Duration) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
