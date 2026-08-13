package progress

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestClientCannotClaimTrustedGradingProvenance(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	for _, gradingKind := range []GradingKind{GradingKindAIAssisted, GradingKindHuman} {
		attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
		attempt.GradingKind = gradingKind
		if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("grading kind %q: got %v", gradingKind, err)
		}
	}
}

func TestImpossibleActiveDurationsAreRejected(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	impossible := int64((2 * time.Hour) / time.Millisecond)
	attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	attempt.ActiveDurationMs = &impossible
	if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("attempt duration: got %v", err)
	}

	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:               run.ID,
		SubmittedAt:      run.StartedAt.Add(10 * time.Minute),
		ActiveDurationMs: &impossible,
	}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("run duration: got %v", err)
	}
	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Run.Status != string(RunStatusActive) {
		t.Fatalf("invalid submit changed status to %q", loaded.Run.Status)
	}
}

func TestSimulationActiveDurationIsBoundedByItsDeadline(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindSimulation)
	run.StartedAt = time.Now().Add(-6 * time.Hour).UTC().Truncate(time.Microsecond)
	deadline := run.StartedAt.Add(p1SimulationDuration)
	run.DeadlineAt = &deadline
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	tooLong := p1SimulationDuration.Milliseconds() + 1
	attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	attempt.StartedAt = run.StartedAt
	attempt.SubmittedAt = run.StartedAt.Add(5 * time.Hour)
	attempt.ActiveDurationMs = &tooLong
	if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("simulation attempt duration: got %v", err)
	}
	if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID:               run.ID,
		CurrentOrdinal:   1,
		ActiveDurationMs: &tooLong,
	}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("simulation checkpoint duration: got %v", err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:               run.ID,
		SubmittedAt:      run.StartedAt.Add(6 * time.Hour),
		ActiveDurationMs: &tooLong,
	}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("simulation submit duration: got %v", err)
	}

	submitted, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:          run.ID,
		SubmittedAt: run.StartedAt.Add(6 * time.Hour),
	})
	if err != nil {
		t.Fatal(err)
	}
	if submitted.Run.DurationMs == nil || *submitted.Run.DurationMs != p1SimulationDuration.Milliseconds() {
		t.Fatalf("late simulation duration was not capped: %+v", submitted.Run.DurationMs)
	}
}

func TestNonSimulationActiveDurationKeepsElapsedBound(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	run.StartedAt = time.Now().Add(-6 * time.Hour).UTC().Truncate(time.Microsecond)
	deadline := run.StartedAt.Add(8 * time.Hour)
	run.DeadlineAt = &deadline
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	longDuration := int64((5 * time.Hour) / time.Millisecond)
	attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	attempt.StartedAt = run.StartedAt
	attempt.SubmittedAt = run.StartedAt.Add(5 * time.Hour)
	attempt.ActiveDurationMs = &longDuration
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatalf("diagnostic attempt duration changed: %v", err)
	}
	if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID:               run.ID,
		CurrentOrdinal:   1,
		ActiveDurationMs: &longDuration,
	}); err != nil {
		t.Fatalf("diagnostic checkpoint duration changed: %v", err)
	}
	submitted, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:               run.ID,
		SubmittedAt:      run.StartedAt.Add(5 * time.Hour),
		ActiveDurationMs: &longDuration,
	})
	if err != nil {
		t.Fatalf("diagnostic submit duration changed: %v", err)
	}
	if submitted.Run.DurationMs == nil || *submitted.Run.DurationMs != longDuration {
		t.Fatalf("diagnostic duration was capped: %+v", submitted.Run.DurationMs)
	}
}

func TestStandaloneAttemptRejectsZeroPointCeiling(t *testing.T) {
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	startedAt := time.Now().Add(-time.Minute).UTC().Truncate(time.Microsecond)
	zero := int16(0)
	target := StandaloneAttemptTarget{
		TaskID:       "log-001",
		ExamPosition: 3,
		TaskRevision: "task-revision",
		MaxPoints:    &zero,
	}
	if _, err := service.RecordAttempt(context.Background(), userID, RecordAttemptInput{
		ID:          uuid.New(),
		Standalone:  &target,
		StartedAt:   startedAt,
		SubmittedAt: startedAt.Add(time.Second),
		Outcome:     AttemptOutcomeUngraded,
		GradingKind: GradingKindAuto,
	}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v", err)
	}
}
