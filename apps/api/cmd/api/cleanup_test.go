package main

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestRunAuthCleanupBoundsScheduledWork(t *testing.T) {
	const timeout = 20 * time.Millisecond
	deadlineRemaining := make(chan time.Duration, 1)
	result := make(chan error, 1)

	go func() {
		result <- runAuthCleanup(context.Background(), timeout, func(ctx context.Context) error {
			deadline, ok := ctx.Deadline()
			if !ok {
				deadlineRemaining <- -1
			} else {
				deadlineRemaining <- time.Until(deadline)
			}
			<-ctx.Done()
			return ctx.Err()
		})
	}()

	select {
	case err := <-result:
		if !errors.Is(err, context.DeadlineExceeded) {
			t.Fatalf("runAuthCleanup() error = %v, want deadline exceeded", err)
		}
	case <-time.After(time.Second):
		t.Fatal("scheduled cleanup did not stop at its deadline")
	}
	remaining := <-deadlineRemaining
	if remaining <= 0 || remaining > timeout {
		t.Fatalf("cleanup deadline remaining = %v, want within (0, %v]", remaining, timeout)
	}
}

func TestCleanupLoopLogsDeadlineOnce(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ticks := make(chan time.Time, 2)
	writer := &cancelingLogWriter{cancel: cancel}
	done := make(chan struct{})
	var calls atomic.Int32

	go func() {
		cleanupOnTicks(
			ctx,
			ticks,
			20*time.Millisecond,
			func(ctx context.Context) error {
				calls.Add(1)
				<-ctx.Done()
				return ctx.Err()
			},
			slog.New(slog.NewJSONHandler(writer, nil)),
		)
		close(done)
	}()

	ticks <- time.Now()
	ticks <- time.Now()
	awaitCleanupLoop(t, done)
	if got := calls.Load(); got != 1 {
		t.Fatalf("cleanup calls = %d, want one after shutdown with an accumulated tick", got)
	}
	for _, fragment := range []string{
		"cleanup expired auth rows",
		`"error":{"kind":"deadline_exceeded"}`,
	} {
		if !strings.Contains(writer.String(), fragment) {
			t.Errorf("cleanup log %q does not contain %q", writer.String(), fragment)
		}
	}
	if strings.Contains(writer.String(), "context deadline exceeded") {
		t.Fatalf("cleanup log contains raw error text: %s", writer.String())
	}
}

func TestCleanupLoopStopsQuietlyOnParentCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ticks := make(chan time.Time, 1)
	started := make(chan struct{})
	done := make(chan struct{})
	var output bytes.Buffer

	go func() {
		cleanupOnTicks(
			ctx,
			ticks,
			time.Minute,
			func(ctx context.Context) error {
				close(started)
				<-ctx.Done()
				return ctx.Err()
			},
			slog.New(slog.NewJSONHandler(&output, nil)),
		)
		close(done)
	}()

	ticks <- time.Now()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("scheduled cleanup did not start")
	}
	cancel()
	awaitCleanupLoop(t, done)
	if output.Len() != 0 {
		t.Fatalf("shutdown cancellation was logged: %s", output.String())
	}
}

func awaitCleanupLoop(t *testing.T, done <-chan struct{}) {
	t.Helper()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cleanup loop did not stop")
	}
}

type cancelingLogWriter struct {
	bytes.Buffer
	cancel context.CancelFunc
}

func (w *cancelingLogWriter) Write(p []byte) (int, error) {
	n, err := w.Buffer.Write(p)
	w.cancel()
	return n, err
}
