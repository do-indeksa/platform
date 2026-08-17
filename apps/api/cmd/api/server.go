package main

import (
	"context"
	"net/http"
	"time"
)

const (
	maxRequestHeaderBytes   = 128 << 10
	requestExecutionTimeout = 20 * time.Second
	serverWriteTimeout      = 30 * time.Second
	gracefulShutdownTimeout = 30 * time.Second
)

func newHTTPServer(address string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              address,
		Handler:           withRequestDeadline(handler, requestExecutionTimeout),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      serverWriteTimeout,
		IdleTimeout:       time.Minute,
		MaxHeaderBytes:    maxRequestHeaderBytes,
	}
}

func withRequestDeadline(next http.Handler, timeout time.Duration) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
