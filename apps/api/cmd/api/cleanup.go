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

func cleanupLoop(
	ctx context.Context,
	interval time.Duration,
	timeout time.Duration,
	cleanup func(context.Context) error,
	logger *slog.Logger,
) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if ctx.Err() != nil {
				return
			}
			cleanupCtx, cancel := context.WithTimeout(ctx, timeout)
			err := cleanup(cleanupCtx)
			if err == nil {
				err = cleanupCtx.Err()
			}
			cancel()
			if err == nil {
				continue
			}
			if ctx.Err() != nil {
				return
			}
			logger.Error("cleanup expired auth rows", safelog.Error(err))
		}
	}
}
