package main

import (
	"github.com/go-chi/chi/v5"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

func registerHTTPRoutes(r chi.Router, srv api.ServerInterface) {
	for _, baseURL := range []string{"", "/api"} {
		api.HandlerWithOptions(srv, api.ChiServerOptions{
			BaseURL:          baseURL,
			BaseRouter:       r,
			ErrorHandlerFunc: auth.ParamErrorHandler,
		})
	}
}
