package main

import (
	"context"
	"errors"
	"strings"
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
	if got := strings.Join(phases, ","); got != "migrate,cleanup" {
		t.Fatalf("startup phases = %q, want migrate,cleanup", got)
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
	phaseCalled := false

	err := initializeDatabase(
		ctx,
		time.Minute,
		func(context.Context) error {
			phaseCalled = true
			return nil
		},
		func(context.Context) error {
			phaseCalled = true
			return nil
		},
	)

	if !errors.Is(err, context.Canceled) {
		t.Fatalf("initializeDatabase() error = %v, want context canceled", err)
	}
	if phaseCalled {
		t.Fatal("startup phase ran after parent cancellation")
	}
}

func TestInitializeDatabaseStopsAfterPhaseFailure(t *testing.T) {
	migrationFailure := errors.New("migration failed")
	cleanupCalled := false
	err := initializeDatabase(
		context.Background(),
		time.Minute,
		func(context.Context) error { return migrationFailure },
		func(context.Context) error {
			cleanupCalled = true
			return nil
		},
	)
	if !errors.Is(err, migrationFailure) || !strings.Contains(err.Error(), "migrate database") {
		t.Fatalf("initializeDatabase() error = %v, want wrapped migration failure", err)
	}
	if cleanupCalled {
		t.Fatal("cleanup ran after migration failure")
	}

	cleanupFailure := errors.New("cleanup failed")
	err = initializeDatabase(
		context.Background(),
		time.Minute,
		func(context.Context) error { return nil },
		func(context.Context) error { return cleanupFailure },
	)
	if !errors.Is(err, cleanupFailure) || !strings.Contains(err.Error(), "cleanup expired auth rows") {
		t.Fatalf("initializeDatabase() error = %v, want wrapped cleanup failure", err)
	}
}
