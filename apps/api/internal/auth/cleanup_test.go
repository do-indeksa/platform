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

func TestDrainExpiredRowsStopsOnBatchError(t *testing.T) {
	want := errors.New("delete failed")
	t.Run("sessions", func(t *testing.T) {
		authCodeCalls := 0
		err := drainExpiredRows(
			t.Context(),
			2,
			func(context.Context, int32) (int64, error) { return 0, want },
			func(context.Context, int32) (int64, error) {
				authCodeCalls++
				return 0, nil
			},
		)
		if !errors.Is(err, want) {
			t.Fatalf("cleanup error = %v, want %v", err, want)
		}
		if authCodeCalls != 0 {
			t.Fatalf("auth-code cleanup calls = %d, want 0", authCodeCalls)
		}
	})

	t.Run("auth codes", func(t *testing.T) {
		err := drainExpiredRows(
			t.Context(),
			2,
			func(context.Context, int32) (int64, error) { return 2, nil },
			func(context.Context, int32) (int64, error) { return 0, want },
		)
		if !errors.Is(err, want) {
			t.Fatalf("cleanup error = %v, want %v", err, want)
		}
	})
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

func TestDrainExpiredRowsReportsCancellationAfterFinalBatch(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	err := drainExpiredRows(
		ctx,
		2,
		func(context.Context, int32) (int64, error) { return 0, nil },
		func(context.Context, int32) (int64, error) {
			cancel()
			return 0, nil
		},
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cleanup error = %v, want context canceled", err)
	}
}

func TestDrainExpiredRowsRequiresPositiveBatchSize(t *testing.T) {
	deletion := func(context.Context, int32) (int64, error) { return 0, nil }
	defer func() {
		if recover() == nil {
			t.Fatal("cleanup accepted a zero batch size")
		}
	}()
	_ = drainExpiredRows(t.Context(), 0, deletion, deletion)
}
