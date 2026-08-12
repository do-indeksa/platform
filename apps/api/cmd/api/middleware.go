package main

import (
	"log/slog"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

func configureRequestLogging(logger *slog.Logger) {
	middleware.DefaultLogger = httpx.RequestLogger(logger)
}
