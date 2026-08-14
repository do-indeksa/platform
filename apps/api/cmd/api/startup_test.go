package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestInitializeDatabaseSharesOneStartupDeadline(t *testing.T) {
	var migrationDeadline time.Time
	var phases []string

	err := initializeDatabase(
		context.Background(),
		time.Minute,
		func(ctx context.Context) error {
			deadline, ok := ctx.Deadline()
			if !ok {
				t.Fatal("migration context has no deadline")
			}
			migrationDeadline = deadline
			phases = append(phases, "migrate")
			return nil
		},
		func(ctx context.Context) error {
			deadline, ok := ctx.Deadline()
			if !ok || !deadline.Equal(migrationDeadline) {
				t.Fatalf("cleanup deadline = %v, want shared deadline %v", deadline, migrationDeadline)
			}
			phases = append(phases, "cleanup")
			return nil
		},
	)
	if err != nil {
		t.Fatalf("initializeDatabase() error = %v", err)
	}
	if got := len(phases); got != 2 || phases[0] != "migrate" || phases[1] != "cleanup" {
		t.Fatalf("startup phases = %v, want [migrate cleanup]", phases)
	}
}

func TestInitializeDatabaseStopsAtDeadline(t *testing.T) {
	const timeout = 20 * time.Millisecond
	cleanupCalled := false
	started := time.Now()

	err := initializeDatabase(
		context.Background(),
		timeout,
		func(ctx context.Context) error {
			<-ctx.Done()
			return ctx.Err()
		},
		func(context.Context) error {
			cleanupCalled = true
			return nil
		},
	)

	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("initializeDatabase() error = %v, want deadline exceeded", err)
	}
	if cleanupCalled {
		t.Fatal("cleanup ran after migration deadline")
	}
	if elapsed := time.Since(started); elapsed < timeout || elapsed > time.Second {
		t.Fatalf("startup timeout took %v", elapsed)
	}
}

func TestInitializeDatabaseHonorsParentCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := initializeDatabase(
		ctx,
		time.Minute,
		func(ctx context.Context) error { return ctx.Err() },
		func(context.Context) error { return nil },
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("initializeDatabase() error = %v, want context canceled", err)
	}
}
