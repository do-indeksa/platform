package main

import (
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
	secureTransport bool,
) http.Handler {
	r := chi.NewRouter()
	r.Use(
		middleware.RequestID,
		middleware.Logger,
		middleware.Recoverer,
		middleware.NoCache,
		httpx.SecurityHeaders(secureTransport),
		auth.UnsafeRequestOriginMiddleware(authService),
	)
	r.Get("/healthz", handleHealth)
	r.Get("/readyz", handleReadiness(readyCheck, readinessTimeout))
	r.With(auth.RequestUserMiddleware(authService)).Handle("/graphql", graphHandler)
	registerHTTPRoutes(r, srv)
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
