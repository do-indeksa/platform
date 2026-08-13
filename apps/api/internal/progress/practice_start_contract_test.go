package progress

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSnapshottedPracticeStartContract(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*StartRunInput)
	}{
		{"partial snapshot", func(input *StartRunInput) { input.Items[0].AnswerPartCount = nil }},
		{"oversized assignment", func(input *StartRunInput) {
			extra := snapshottedPracticeRun(maxPracticeTaskCount + 1)
			input.Items = extra.Items
		}},
		{"mutable blueprint", func(input *StartRunInput) { input.BlueprintVersion = "practice-v1" }},
		{"mutable content", func(input *StartRunInput) { input.ContentRevision = "mutable" }},
		{"deadline", func(input *StartRunInput) { value := input.StartedAt.Add(time.Hour); input.DeadlineAt = &value }},
		{"arbitrary item id", func(input *StartRunInput) { input.Items[0].ID = uuid.New() }},
		{"mutable task revision", func(input *StartRunInput) { input.Items[0].TaskRevision = "mutable" }},
		{"exam points", func(input *StartRunInput) { value := int16(6); input.Items[0].MaxPoints = &value }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := snapshottedPracticeRun(3)
			test.mutate(&input)
			service := NewService(testPool)
			userID := seedProgressUser(t, "")
			if _, err := service.StartRun(context.Background(), userID, input); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestSnapshottedPracticeAllowsRepeatedPositionsAndLegacyRetries(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	strict := snapshottedPracticeRun(3)
	strict.Items[1].ExamPosition = strict.Items[0].ExamPosition
	if _, err := service.StartRun(ctx, userID, strict); err != nil {
		t.Fatalf("repeated position: %v", err)
	}

	legacyRetry := strict
	legacyRetry.Items = append([]NewRunItem(nil), strict.Items...)
	for index := range legacyRetry.Items {
		legacyRetry.Items[index].AnswerPartCount = nil
	}
	if _, err := service.StartRun(ctx, userID, legacyRetry); err != nil {
		t.Fatalf("legacy retry: %v", err)
	}

	legacy := snapshottedPracticeRun(2)
	for index := range legacy.Items {
		legacy.Items[index].AnswerPartCount = nil
	}
	if _, err := service.StartRun(ctx, userID, legacy); err != nil {
		t.Fatal(err)
	}
	enriched := legacy
	enriched.Items = append([]NewRunItem(nil), legacy.Items...)
	for index := range enriched.Items {
		count := int16(1)
		enriched.Items[index].AnswerPartCount = &count
	}
	if _, err := service.StartRun(ctx, userID, enriched); err != nil {
		t.Fatalf("strict retry of legacy assignment: %v", err)
	}
	if _, err := service.StartRun(ctx, userID, legacy); err != nil {
		t.Fatalf("legacy retry after strict-compatible retry: %v", err)
	}

	arbitraryLegacy := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, arbitraryLegacy); err != nil {
		t.Fatal(err)
	}
	if _, err := service.StartRun(ctx, userID, arbitraryLegacy); err != nil {
		t.Fatalf("arbitrary legacy retry: %v", err)
	}
}

func TestSnapshottedPracticeRejectsPartiallyStoredSnapshot(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 2)
	if _, err := testPool.Exec(ctx, `
		update run_items set answer_part_count = null where id = $1 and user_id = $2
	`, run.Items[0].ID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := service.StartRun(ctx, userID, run); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v", err)
	}
}
