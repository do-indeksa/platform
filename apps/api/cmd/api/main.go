package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/do-indeksa/platform/apps/api/db"
	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/graph"
	"github.com/do-indeksa/platform/apps/api/internal/prep"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/training"
)

type authHandler = auth.Handler

type progressHandler = progress.Handler

type apiServer struct {
	*authHandler
	*progressHandler
}

var _ api.ServerInterface = apiServer{}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("api exited", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := loadRuntimeConfig()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := pgxpool.NewWithConfig(ctx, cfg.database)
	if err != nil {
		return err
	}
	defer pool.Close()

	authService := auth.NewService(pool, cfg.auth)
	if err := initializeDatabase(
		ctx,
		databaseStartupTimeout,
		func(ctx context.Context) error { return db.Migrate(ctx, pool) },
		authService.CleanupExpired,
	); err != nil {
		return err
	}

	progressService := progress.NewService(pool)
	prepService := prep.NewService(pool)
	trainingService := training.NewService(pool)
	go cleanupLoop(ctx, authService)

	srv := apiServer{
		authHandler:     auth.NewHandler(authService),
		progressHandler: progress.NewHandler(authService, progressService),
	}

	r := newRouter(
		authService,
		srv,
		graph.NewHandler(graph.NewResolver(
			progressService,
			prepService,
			trainingService,
		)),
		pool.Ping,
		slog.Default(),
		strings.HasPrefix(cfg.auth.CanonicalOrigin, "https://"),
	)

	server := newHTTPServer(cfg.listenAddress, r)

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
