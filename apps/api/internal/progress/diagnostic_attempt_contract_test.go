package progress

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSnapshottedDiagnosticAttemptContract(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*RecordAttemptInput)
	}{
		{"random attempt id", func(input *RecordAttemptInput) { input.ID = uuid.New() }},
		{"plain answer", func(input *RecordAttemptInput) { answer := "42"; input.Answer = &answer }},
		{"wrong answer part count", func(input *RecordAttemptInput) { answer := `["42"]`; input.Answer = &answer }},
		{"help used", func(input *RecordAttemptInput) { input.HelpLevel = 1 }},
		{"rubric grading", func(input *RecordAttemptInput) { input.GradingKind = GradingKindRubricSelf }},
		{"partial outcome", func(input *RecordAttemptInput) { input.Outcome = AttemptOutcomePartial }},
		{"skipped answer retained", func(input *RecordAttemptInput) { input.Outcome = AttemptOutcomeSkipped }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			service := NewService(testPool)
			userID := seedProgressUser(t, "")
			run := snapshottedDiagnosticRun()
			if _, err := service.StartRun(ctx, userID, run); err != nil {
				t.Fatal(err)
			}
			attempt := diagnosticAttempt(run, 0, run.StartedAt, run.StartedAt.Add(time.Minute))
			test.mutate(&attempt)
			if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestSnapshottedDiagnosticAttemptsFormCausalPrefix(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	firstSubmittedAt := run.StartedAt.Add(time.Minute)
	second := diagnosticAttempt(run, 1, firstSubmittedAt, firstSubmittedAt.Add(time.Minute))
	if _, err := service.RecordAttempt(ctx, userID, second); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("second item before first: got %v", err)
	}
	first := diagnosticAttempt(run, 0, run.StartedAt, firstSubmittedAt)
	if _, err := service.RecordAttempt(ctx, userID, first); err != nil {
		t.Fatalf("first item: %v", err)
	}
	if _, err := service.RecordAttempt(ctx, userID, first); err != nil {
		t.Fatalf("idempotent first item: %v", err)
	}

	third := diagnosticAttempt(run, 2, firstSubmittedAt.Add(time.Minute), firstSubmittedAt.Add(2*time.Minute))
	if _, err := service.RecordAttempt(ctx, userID, third); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("third item before second: got %v", err)
	}
	overlapping := second
	overlapping.StartedAt = firstSubmittedAt.Add(-time.Microsecond)
	if _, err := service.RecordAttempt(ctx, userID, overlapping); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("overlapping second item: got %v", err)
	}
	if _, err := service.RecordAttempt(ctx, userID, second); err != nil {
		t.Fatalf("causal second item: %v", err)
	}
}

func TestSnapshottedDiagnosticConcurrentAttemptsKeepPrefix(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	errorsByAttempt := make(chan error, 2)
	var writers sync.WaitGroup
	for index := 0; index < 2; index++ {
		writers.Add(1)
		go func(index int) {
			defer writers.Done()
			<-start
			startedAt := run.StartedAt.Add(time.Duration(index) * time.Minute)
			_, err := service.RecordAttempt(
				ctx,
				userID,
				diagnosticAttempt(run, index, startedAt, startedAt.Add(time.Minute)),
			)
			errorsByAttempt <- err
		}(index)
	}
	close(start)
	writers.Wait()
	close(errorsByAttempt)
	for err := range errorsByAttempt {
		if err != nil && !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("unexpected concurrent error: %v", err)
		}
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Attempts) < 1 || len(loaded.Attempts) > 2 {
		t.Fatalf("attempt count = %d", len(loaded.Attempts))
	}
	for index, attempt := range loaded.Attempts {
		if !attempt.RunItemID.Valid || uuid.UUID(attempt.RunItemID.Bytes) != run.Items[index].ID {
			t.Fatalf("attempt %d broke the prefix: %+v", index, attempt)
		}
	}
}
