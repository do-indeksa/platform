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

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/do-indeksa/platform/apps/api/db"
	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/graph"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/safelog"
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
	slog.SetDefault(newApplicationLogger(os.Stdout))
	if err := run(); err != nil {
		slog.Error("api exited", safelog.Error(err))
		os.Exit(1)
	}
}

func run() error {
	cfg, err := loadRuntimeConfig()
	if err != nil {
		return err
	}
	logger := slog.Default()

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
	trainingService := training.NewService(pool)
	go cleanupLoop(ctx, authService.CleanupExpired, logger)

	srv := apiServer{
		authHandler:     auth.NewHandler(authService),
		progressHandler: progress.NewHandler(authService, progressService),
	}

	r := newRouter(
		authService,
		srv,
		graph.NewHandler(graph.NewResolver(
			progressService,
			trainingService,
		)),
		pool.Ping,
		cfg.maxInFlightRequests,
		logger,
		strings.HasPrefix(cfg.auth.CanonicalOrigin, "https://"),
	)

	server := newHTTPServer(cfg.listenAddress, r, logger)

	errCh := make(chan error, 1)
	go func() {
		logger.Info("api listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), gracefulShutdownTimeout)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
