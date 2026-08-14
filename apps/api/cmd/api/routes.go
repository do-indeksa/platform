package main

import (
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

func newRouter(
	authService *auth.Service,
	srv api.ServerInterface,
	graphHandler http.Handler,
	readyCheck readinessCheck,
	maxInFlightRequests int,
	logger *slog.Logger,
	secureTransport bool,
) http.Handler {
	r := chi.NewRouter()
	r.Use(
		httpx.RequestID,
		httpx.RequestLogger(logger),
		middleware.Recoverer,
		middleware.NoCache,
		httpx.SecurityHeaders(secureTransport),
		auth.UnsafeRequestOriginMiddleware(authService),
	)
	r.Get("/healthz", handleHealth)
	r.Get("/readyz", handleReadiness(readyCheck, readinessTimeout))
	r.Group(func(application chi.Router) {
		application.Use(httpx.LimitInFlight(maxInFlightRequests))
		application.With(auth.RequestUserMiddleware(authService)).Handle("/graphql", graphHandler)
		registerHTTPRoutes(application, srv)
	})
	return r
}

func registerHTTPRoutes(r chi.Router, srv api.ServerInterface) {
	for _, baseURL := range []string{"", "/api"} {
		api.HandlerWithOptions(srv, api.ChiServerOptions{
			BaseURL:          baseURL,
			BaseRouter:       r,
			ErrorHandlerFunc: auth.ParamErrorHandler,
		})
	}
}
