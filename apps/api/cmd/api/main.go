package main

import (
	"cmp"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/do-indeksa/platform/apps/api/db"
	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

func main() {
	if err := run(); err != nil {
		slog.Error("api exited", "error", err)
		os.Exit(1)
	}
}

func run() error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := db.Migrate(pool); err != nil {
		return err
	}

	authCfg, err := authConfig()
	if err != nil {
		return err
	}
	authService := auth.NewService(pool, authCfg)
	if err := authService.CleanupExpired(ctx); err != nil {
		return err
	}
	go cleanupLoop(ctx, authService)

	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.Logger, middleware.Recoverer, middleware.NoCache)
	r.Get("/healthz", handleHealth)
	api.HandlerWithOptions(auth.NewHandler(authService), api.ChiServerOptions{
		BaseRouter:       r,
		ErrorHandlerFunc: auth.ParamErrorHandler,
	})

	server := &http.Server{
		Addr:              ":" + cmp.Or(os.Getenv("PORT"), "8080"),
		Handler:           r,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       time.Minute,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}

func authConfig() (auth.Config, error) {
	secret, err := hex.DecodeString(os.Getenv("AUTH_SECRET"))
	if err != nil || len(secret) != 32 {
		return auth.Config{}, errors.New("AUTH_SECRET must be 64 hex characters")
	}
	cfg := auth.Config{
		ClientID:            os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret:        os.Getenv("GOOGLE_CLIENT_SECRET"),
		Secret:              secret,
		CanonicalOrigin:     os.Getenv("CANONICAL_WEB_ORIGIN"),
		PreviewOriginSuffix: os.Getenv("PREVIEW_ORIGIN_SUFFIX"),
	}
	for origin := range strings.SplitSeq(os.Getenv("EXTRA_WEB_ORIGINS"), ",") {
		if origin = strings.TrimSpace(origin); origin != "" {
			cfg.ExtraOrigins = append(cfg.ExtraOrigins, origin)
		}
	}
	for name, value := range map[string]string{
		"GOOGLE_CLIENT_ID":     cfg.ClientID,
		"GOOGLE_CLIENT_SECRET": cfg.ClientSecret,
		"CANONICAL_WEB_ORIGIN": cfg.CanonicalOrigin,
	} {
		if value == "" {
			return auth.Config{}, fmt.Errorf("%s is required", name)
		}
	}
	return cfg, nil
}

func cleanupLoop(ctx context.Context, service *auth.Service) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := service.CleanupExpired(ctx); err != nil {
				slog.Error("cleanup expired auth rows", "error", err)
			}
		}
	}
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}
