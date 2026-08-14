package main

import (
	"net/http"
	"time"
)

const (
	maxRequestHeaderBytes = 128 << 10
	maxRequestTargetBytes = 16 << 10
)

func newHTTPServer(address string, handler http.Handler) *http.Server {
	return &http.Server{
		Addr:              address,
		Handler:           limitRequestTarget(handler),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
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
