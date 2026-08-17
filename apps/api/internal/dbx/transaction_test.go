package dbx

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type rollbackTx struct {
	pgx.Tx
	rollback func(context.Context) error
}

type rollbackContextKey struct{}

func (tx rollbackTx) Rollback(ctx context.Context) error {
	return tx.rollback(ctx)
}

func TestRollbackDetachesCallerCancellationAndStaysBounded(t *testing.T) {
	t.Parallel()
	parent, cancel := context.WithCancel(context.Background())
	parent = context.WithValue(parent, rollbackContextKey{}, "trace-value")
	cancel()

	called := false
	err := Rollback(parent, rollbackTx{rollback: func(ctx context.Context) error {
		called = true
		if err := ctx.Err(); err != nil {
			t.Fatalf("rollback context started canceled: %v", err)
		}
		if value := ctx.Value(rollbackContextKey{}); value != "trace-value" {
			t.Fatalf("rollback context value = %v, want trace-value", value)
		}
		deadline, ok := ctx.Deadline()
		if !ok {
			t.Fatal("rollback context has no deadline")
		}
		remaining := time.Until(deadline)
		if remaining <= 0 || remaining > rollbackTimeout {
			t.Fatalf("rollback deadline remaining = %v, want within (0, %v]", remaining, rollbackTimeout)
		}
		return nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("rollback was not called")
	}
}

func TestRollbackDeadlineCancelsBlockedCleanup(t *testing.T) {
	t.Parallel()
	timeout := 25 * time.Millisecond
	started := time.Now()
	err := rollbackWithTimeout(context.Background(), rollbackTx{rollback: func(ctx context.Context) error {
		<-ctx.Done()
		return ctx.Err()
	}}, timeout)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("rollback error = %v, want context deadline exceeded", err)
	}
	if elapsed := time.Since(started); elapsed > time.Second {
		t.Fatalf("rollback elapsed = %v, want no more than 1s", elapsed)
	}
}

func TestRollbackPreservesTransactionResult(t *testing.T) {
	t.Parallel()
	want := errors.New("rollback failed")
	err := Rollback(context.Background(), rollbackTx{rollback: func(context.Context) error {
		return want
	}})
	if !errors.Is(err, want) {
		t.Fatalf("rollback error = %v, want %v", err, want)
	}
}
