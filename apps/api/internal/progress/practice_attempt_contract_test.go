package progress

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSnapshottedPracticeAttemptContract(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*RecordAttemptInput)
	}{
		{"arbitrary id", func(input *RecordAttemptInput) { input.ID = uuid.New() }},
		{"wrong shape", func(input *RecordAttemptInput) { answer := `["one"]`; input.Answer = &answer }},
		{"missing answer", func(input *RecordAttemptInput) { input.Answer = nil }},
		{"partial outcome", func(input *RecordAttemptInput) { input.Outcome = AttemptOutcomePartial }},
		{"self rubric", func(input *RecordAttemptInput) { input.GradingKind = GradingKindRubricSelf }},
		{"earned points", func(input *RecordAttemptInput) { value := int16(0); input.EarnedPoints = &value }},
		{"overlong part", func(input *RecordAttemptInput) {
			answer := `["` + strings.Repeat("x", maxAnswerPartLength+1) + `","y"]`
			input.Answer = &answer
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			service := NewService(testPool)
			userID := seedProgressUser(t, "")
			run := startPracticeRun(t, service, userID, 2)
			attempt := practiceAttempt(run, 1, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0)
			test.mutate(&attempt)
			if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestSnapshottedPracticePreservesOrderedRetries(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 2)
	first := practiceAttempt(run, 0, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0)
	if _, err := service.RecordAttempt(ctx, userID, first); err != nil {
		t.Fatal(err)
	}

	outOfOrder := practiceAttempt(run, 0, 3, first.SubmittedAt, first.SubmittedAt.Add(time.Minute), AttemptOutcomeIncorrect, 1)
	if _, err := service.RecordAttempt(ctx, userID, outOfOrder); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("out of order: %v", err)
	}
	lowerHelp := practiceAttempt(run, 0, 2, first.SubmittedAt, first.SubmittedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0)
	first.HelpLevel = 1
	if _, err := service.RecordAttempt(ctx, userID, first); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed retry: %v", err)
	}
	first.HelpLevel = 0
	lowerHelp.HelpLevel = 0
	second := lowerHelp
	second.HelpLevel = 1
	if _, err := service.RecordAttempt(ctx, userID, second); err != nil {
		t.Fatal(err)
	}
	decreasingHelp := practiceAttempt(
		run, 0, 3, second.SubmittedAt, second.SubmittedAt.Add(time.Minute),
		AttemptOutcomeIncorrect, 0,
	)
	if _, err := service.RecordAttempt(ctx, userID, decreasingHelp); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("decreasing help: %v", err)
	}
	terminal := practiceAttempt(run, 0, 3, second.SubmittedAt, second.SubmittedAt.Add(time.Minute), AttemptOutcomeCorrect, 1)
	if _, err := service.RecordAttempt(ctx, userID, terminal); err != nil {
		t.Fatal(err)
	}
	afterTerminal := practiceAttempt(run, 0, 4, terminal.SubmittedAt, terminal.SubmittedAt.Add(time.Minute), AttemptOutcomeIncorrect, 1)
	if _, err := service.RecordAttempt(ctx, userID, afterTerminal); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("after terminal: %v", err)
	}
	if _, err := service.RecordAttempt(ctx, userID, terminal); err != nil {
		t.Fatalf("terminal retry: %v", err)
	}
}

func TestSnapshottedPracticeRequiresUnambiguousGlobalAttemptOrder(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 2)
	firstSubmittedAt := run.StartedAt.Add(time.Minute).Truncate(time.Millisecond)
	first := practiceAttempt(
		run, 0, 1, run.StartedAt, firstSubmittedAt,
		AttemptOutcomeIncorrect, 0,
	)
	if _, err := service.RecordAttempt(ctx, userID, first); err != nil {
		t.Fatal(err)
	}

	ambiguous := practiceAttempt(
		run, 1, 1, first.SubmittedAt, first.SubmittedAt,
		AttemptOutcomeIncorrect, 0,
	)
	if _, err := service.RecordAttempt(ctx, userID, ambiguous); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("equal submission time: %v", err)
	}
	ambiguous = practiceAttempt(
		run, 1, 1, first.SubmittedAt, first.SubmittedAt.Add(time.Microsecond),
		AttemptOutcomeIncorrect, 0,
	)
	if _, err := service.RecordAttempt(ctx, userID, ambiguous); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("same browser millisecond: %v", err)
	}
	ordered := practiceAttempt(
		run, 1, 1, first.SubmittedAt, first.SubmittedAt.Add(time.Millisecond),
		AttemptOutcomeIncorrect, 0,
	)
	if _, err := service.RecordAttempt(ctx, userID, ordered); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update attempts
		set started_at = $1, submitted_at = $1, created_at = $1
		where public_id = $2 and user_id = $3
	`, first.SubmittedAt, ordered.ID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetRun(ctx, userID, run.ID); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("ambiguous stored order: %v", err)
	}
}

func TestSnapshottedPracticeBoundsAttemptsPerItem(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 1)
	previousSubmittedAt := run.StartedAt
	for number := 1; number <= maxPracticeAttemptsPerItem; number++ {
		submittedAt := previousSubmittedAt.Add(time.Minute)
		attempt := practiceAttempt(
			run, 0, number, previousSubmittedAt, submittedAt, AttemptOutcomeIncorrect, 0,
		)
		if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
			t.Fatalf("attempt %d: %v", number, err)
		}
		previousSubmittedAt = submittedAt
	}
	overLimit := practiceAttempt(
		run, 0, maxPracticeAttemptsPerItem+1, previousSubmittedAt,
		previousSubmittedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0,
	)
	if _, err := service.RecordAttempt(ctx, userID, overLimit); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("over limit: %v", err)
	}
}

func TestSnapshottedPracticeSerializesAttemptWrites(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 1)
	lockTx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	locked := true
	t.Cleanup(func() {
		if locked {
			_ = lockTx.Rollback(ctx)
		}
	})
	if _, err := service.queries.WithTx(lockTx).GetRunForUpdate(ctx, GetRunForUpdateParams{ID: run.ID, UserID: userID}); err != nil {
		t.Fatal(err)
	}
	attempt := practiceAttempt(run, 0, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0)
	blockedCtx, cancel := context.WithTimeout(ctx, 250*time.Millisecond)
	defer cancel()
	if _, err := service.RecordAttempt(blockedCtx, userID, attempt); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("did not wait for run lock: %v", err)
	}
	if err := lockTx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	locked = false
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
}
