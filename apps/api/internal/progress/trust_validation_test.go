package progress

import (
	"context"
	"errors"
	"sync"
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

	bounded := p1SimulationDuration.Milliseconds()
	lateAttempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	lateAttempt.StartedAt = run.StartedAt
	lateAttempt.SubmittedAt = run.StartedAt.Add(5 * time.Hour)
	lateAttempt.ActiveDurationMs = &bounded
	if _, err := service.RecordAttempt(ctx, userID, lateAttempt); err != nil {
		t.Fatalf("delayed simulation attempt was rejected: %v", err)
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

func TestRunLinkedAttemptCannotPredateRun(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	attempt.StartedAt = run.StartedAt.Add(-time.Minute)
	attempt.SubmittedAt = run.StartedAt.Add(time.Minute)
	if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("attempt before run: got %v", err)
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Attempts) != 0 {
		t.Fatalf("invalid attempt was persisted: %+v", loaded.Attempts)
	}
}

func TestRunSubmissionCannotPredateStoredAttempt(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	attempt.StartedAt = run.StartedAt.Add(10 * time.Minute)
	attempt.SubmittedAt = run.StartedAt.Add(20 * time.Minute)
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:          run.ID,
		SubmittedAt: attempt.SubmittedAt.Add(-time.Microsecond),
	}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("submission before attempt: got %v", err)
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Run.Status != string(RunStatusActive) {
		t.Fatalf("invalid submission changed status: %+v", loaded.Run)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:          run.ID,
		SubmittedAt: attempt.SubmittedAt,
	}); err != nil {
		t.Fatalf("submission at attempt boundary: %v", err)
	}
}

func TestSubmittedRunRetryRequiresCanonicalPayload(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	submittedAt := run.StartedAt.Add(20 * time.Minute)
	duration := int64(18 * time.Minute / time.Millisecond)
	canonical := SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt, ActiveDurationMs: &duration}
	if _, err := service.SubmitRun(ctx, userID, canonical); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		insert into run_checkpoints (run_id, user_id, version, current_ordinal, active_duration_ms)
		values ($1, $2, 1, 1, $3)
	`, run.ID, userID, duration); err != nil {
		t.Fatal(err)
	}

	changedTimestamp := canonical
	changedTimestamp.SubmittedAt = submittedAt.Add(time.Second)
	if _, err := service.SubmitRun(ctx, userID, changedTimestamp); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed retry timestamp: got %v", err)
	}
	changedDuration := duration - 1
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: run.ID, SubmittedAt: submittedAt, ActiveDurationMs: &changedDuration,
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed retry duration: got %v", err)
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint == nil || !loaded.Run.SubmittedAt.Valid ||
		!loaded.Run.SubmittedAt.Time.Equal(submittedAt) || loaded.Run.DurationMs == nil ||
		*loaded.Run.DurationMs != duration {
		t.Fatalf("conflicting retry changed canonical state: %+v", loaded)
	}

	retried, err := service.SubmitRun(ctx, userID, canonical)
	if err != nil {
		t.Fatalf("canonical retry failed: %v", err)
	}
	if retried.Checkpoint != nil {
		t.Fatalf("canonical retry retained checkpoint: %+v", retried.Checkpoint)
	}
}

func TestAttemptAndSubmissionRaceCannotCreateCausalInversion(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	attempt.StartedAt = run.StartedAt.Add(20 * time.Minute)
	attempt.SubmittedAt = run.StartedAt.Add(30 * time.Minute)
	submit := SubmitRunInput{ID: run.ID, SubmittedAt: run.StartedAt.Add(25 * time.Minute)}
	start := make(chan struct{})
	results := make(chan error, 2)
	var ready sync.WaitGroup
	ready.Add(2)
	go func() {
		ready.Done()
		<-start
		_, err := service.RecordAttempt(ctx, userID, attempt)
		results <- err
	}()
	go func() {
		ready.Done()
		<-start
		_, err := service.SubmitRun(ctx, userID, submit)
		results <- err
	}()
	ready.Wait()
	close(start)
	firstErr, secondErr := <-results, <-results
	successes := 0
	for _, err := range []error{firstErr, secondErr} {
		if err == nil {
			successes++
			continue
		}
		if !errors.Is(err, ErrInvalidInput) && !errors.Is(err, ErrInvalidTransition) {
			t.Fatalf("unexpected race error: %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("race successes = %d, errors = [%v, %v]", successes, firstErr, secondErr)
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Run.Status == string(RunStatusSubmitted) && len(loaded.Attempts) != 0 {
		t.Fatalf("submitted run retained a later attempt: %+v", loaded)
	}
	if loaded.Run.Status == string(RunStatusActive) && len(loaded.Attempts) != 1 {
		t.Fatalf("active run lost the winning attempt: %+v", loaded)
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
