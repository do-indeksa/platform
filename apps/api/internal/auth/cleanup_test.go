package auth

import (
	"context"
	"errors"
	"slices"
	"testing"
)

func TestDrainExpiredRowsInterleavesTables(t *testing.T) {
	var calls []string
	sessionResults := []int64{2, 1}
	authCodeResults := []int64{2, 2, 0}

	err := drainExpiredRows(
		t.Context(),
		2,
		func(context.Context, int32) (int64, error) {
			calls = append(calls, "sessions")
			result := sessionResults[0]
			sessionResults = sessionResults[1:]
			return result, nil
		},
		func(context.Context, int32) (int64, error) {
			calls = append(calls, "auth_codes")
			result := authCodeResults[0]
			authCodeResults = authCodeResults[1:]
			return result, nil
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"sessions", "auth_codes", "sessions", "auth_codes", "auth_codes"}
	if !slices.Equal(calls, want) {
		t.Fatalf("cleanup calls = %v, want %v", calls, want)
	}
}

func TestDrainExpiredRowsStopsOnError(t *testing.T) {
	want := errors.New("delete failed")
	authCodeCalls := 0
	err := drainExpiredRows(
		t.Context(),
		2,
		func(context.Context, int32) (int64, error) { return 2, nil },
		func(context.Context, int32) (int64, error) {
			authCodeCalls++
			return 0, want
		},
	)
	if !errors.Is(err, want) {
		t.Fatalf("cleanup error = %v, want %v", err, want)
	}
	if authCodeCalls != 1 {
		t.Fatalf("auth-code cleanup calls = %d, want 1", authCodeCalls)
	}
}

func TestDrainExpiredRowsStopsBetweenTablesOnCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	authCodeCalled := false
	err := drainExpiredRows(
		ctx,
		2,
		func(context.Context, int32) (int64, error) {
			cancel()
			return 2, nil
		},
		func(context.Context, int32) (int64, error) {
			authCodeCalled = true
			return 0, nil
		},
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cleanup error = %v, want context canceled", err)
	}
	if authCodeCalled {
		t.Fatal("auth-code cleanup started after cancellation")
	}
}
