package main

import (
	"context"
	"log/slog"
	"time"

	"github.com/do-indeksa/platform/apps/api/internal/safelog"
)

const (
	authCleanupInterval = time.Hour
	authCleanupTimeout  = 30 * time.Second
)

type authCleanupFunc func(context.Context) error

func cleanupLoop(ctx context.Context, cleanup authCleanupFunc, logger *slog.Logger) {
	ticker := time.NewTicker(authCleanupInterval)
	defer ticker.Stop()
	cleanupOnTicks(ctx, ticker.C, authCleanupTimeout, cleanup, logger)
}

func cleanupOnTicks(
	ctx context.Context,
	ticks <-chan time.Time,
	timeout time.Duration,
	cleanup authCleanupFunc,
	logger *slog.Logger,
) {
	for {
		select {
		case <-ctx.Done():
			return
		case _, ok := <-ticks:
			if !ok || ctx.Err() != nil {
				return
			}
			if err := runAuthCleanup(ctx, timeout, cleanup); err != nil {
				if ctx.Err() != nil {
					return
				}
				logger.Error("cleanup expired auth rows", safelog.Error(err))
			}
		}
	}
}

func runAuthCleanup(
	parent context.Context,
	timeout time.Duration,
	cleanup authCleanupFunc,
) error {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()
	if err := cleanup(ctx); err != nil {
		return err
	}
	return ctx.Err()
}
