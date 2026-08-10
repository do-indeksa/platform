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
