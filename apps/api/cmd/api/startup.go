package main

import (
	"context"
	"fmt"
	"time"
)

const databaseStartupTimeout = 2 * time.Minute

type databaseStartupStep func(context.Context) error

func initializeDatabase(
	parent context.Context,
	timeout time.Duration,
	migrate databaseStartupStep,
	cleanup databaseStartupStep,
) error {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	if err := migrate(ctx); err != nil {
		return fmt.Errorf("migrate database: %w", err)
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := cleanup(ctx); err != nil {
		return fmt.Errorf("cleanup expired auth rows: %w", err)
	}
	return ctx.Err()
}
