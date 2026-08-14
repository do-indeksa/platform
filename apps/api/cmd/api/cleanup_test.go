package main

import (
	"bytes"
	"context"
	"log/slog"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestCleanupLoopBoundsScheduledWork(t *testing.T) {
	const timeout = 20 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	writer := &cancelingLogWriter{cancel: cancel}
	logger := slog.New(slog.NewJSONHandler(writer, nil))
	deadlineRemaining := make(chan time.Duration, 1)
	done := make(chan struct{})
	var calls atomic.Int32

	go func() {
		cleanupLoop(
			ctx,
			time.Millisecond,
			timeout,
			func(ctx context.Context) error {
				if calls.Add(1) != 1 {
					return ctx.Err()
				}
				deadline, ok := ctx.Deadline()
				if !ok {
					deadlineRemaining <- -1
				} else {
					deadlineRemaining <- time.Until(deadline)
				}
				<-ctx.Done()
				return ctx.Err()
			},
			logger,
		)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cleanup loop did not stop after the logged timeout")
	}
	if got := calls.Load(); got != 1 {
		t.Fatalf("cleanup calls = %d, want exactly one before cancellation", got)
	}
	remaining := <-deadlineRemaining
	if remaining <= 0 || remaining > timeout {
		t.Fatalf("cleanup deadline remaining = %v, want within (0, %v]", remaining, timeout)
	}
	for _, fragment := range []string{"cleanup expired auth rows", "context deadline exceeded"} {
		if !strings.Contains(writer.String(), fragment) {
			t.Errorf("cleanup log %q does not contain %q", writer.String(), fragment)
		}
	}
}

func TestCleanupLoopStopsQuietlyOnParentCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var output bytes.Buffer
	started := make(chan struct{})
	done := make(chan struct{})

	go func() {
		cleanupLoop(
			ctx,
			time.Millisecond,
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

	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("scheduled cleanup did not start")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("cleanup loop did not stop after parent cancellation")
	}
	if output.Len() != 0 {
		t.Fatalf("shutdown cancellation was logged: %s", output.String())
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
