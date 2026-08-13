package progress

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestSnapshottedPracticeSubmissionRequiresOneValidAttempt(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 3)
	submittedAt := run.StartedAt.Add(10 * time.Minute)
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("empty run: %v", err)
	}
	attempt := practiceAttempt(run, 1, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeSkipped, 0)
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
	submitted, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt})
	if err != nil {
		t.Fatal(err)
	}
	if submitted.Run.Status != string(RunStatusSubmitted) || len(submitted.Attempts) != 1 {
		t.Fatalf("submitted: %+v", submitted)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt}); err != nil {
		t.Fatalf("retry: %v", err)
	}
}

func TestSnapshottedPracticeSubmissionRejectsMalformedStoredAttempt(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 1)
	attempt := practiceAttempt(run, 0, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0)
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `update attempts set grading_kind = 'rubric_self' where public_id = $1 and user_id = $2`, attempt.ID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: run.StartedAt.Add(10 * time.Minute)}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v", err)
	}
}

func TestSnapshottedPracticeRetryRejectsMalformedStoredDuration(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 1)
	attempt := practiceAttempt(run, 0, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeCorrect, 0)
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
	submittedAt := run.StartedAt.Add(2 * time.Minute)
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt}); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `update runs set duration_ms = $1 where id = $2 and user_id = $3`,
		int64((10*time.Minute)/time.Millisecond), run.ID, userID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v", err)
	}
}

func TestSnapshottedPracticeRetryRejectsSubmittedCheckpoint(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 1)
	attempt := practiceAttempt(run, 0, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeCorrect, 0)
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
	submittedAt := run.StartedAt.Add(2 * time.Minute)
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt}); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		insert into run_checkpoints (run_id, user_id, version, current_ordinal)
		values ($1, $2, 1, 1)
	`, run.ID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: run.ID, SubmittedAt: submittedAt}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v", err)
	}
}
