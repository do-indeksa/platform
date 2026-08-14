package main

import (
	"context"
	"net/http"
	"time"
)

const (
	maxRequestHeaderBytes   = 128 << 10
	maxRequestTargetBytes   = 16 << 10
	requestExecutionTimeout = 20 * time.Second
	gracefulShutdownTimeout = 30 * time.Second
)

func newHTTPServer(address string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              address,
		Handler:           limitRequestTarget(withRequestDeadline(handler, requestExecutionTimeout)),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
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

func limitRequestTarget(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if len(r.RequestURI) > maxRequestTargetBytes {
			http.Error(w, http.StatusText(http.StatusRequestURITooLong), http.StatusRequestURITooLong)
			return
		}
		next.ServeHTTP(w, r)
	})
}
