package progress

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestStartRunEnforcesSnapshottedDiagnosticShape(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*StartRunInput)
	}{
		{"partial snapshot", func(input *StartRunInput) { input.Items[0].AnswerPartCount = nil }},
		{"wrong item count", func(input *StartRunInput) { input.Items = input.Items[:9] }},
		{"non deterministic item id", func(input *StartRunInput) { input.Items[0].ID = uuid.New() }},
		{"unordered position", func(input *StartRunInput) { input.Items[0].ExamPosition = 2 }},
		{"non FTN blueprint", func(input *StartRunInput) { input.BlueprintVersion = "diagnostic-v1" }},
		{"mutable content revision", func(input *StartRunInput) { input.ContentRevision = "content-revision" }},
		{"mutable task revision", func(input *StartRunInput) { input.Items[0].TaskRevision = "task-revision" }},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := NewService(testPool)
			userID := seedProgressUser(t, "")
			run := snapshottedDiagnosticRun()
			test.mutate(&run)
			if _, err := service.StartRun(context.Background(), userID, run); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestStartRunKeepsLegacyDiagnosticContract(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	legacy := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, legacy); err != nil {
		t.Fatal(err)
	}
	if _, err := service.StartRun(ctx, userID, legacy); err != nil {
		t.Fatalf("legacy retry failed: %v", err)
	}

	strict := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, strict); err != nil {
		t.Fatal(err)
	}
	queuedLegacy := strict
	queuedLegacy.Items = append([]NewRunItem(nil), strict.Items...)
	for index := range queuedLegacy.Items {
		queuedLegacy.Items[index].AnswerPartCount = nil
	}
	retried, err := service.StartRun(ctx, userID, queuedLegacy)
	if err != nil {
		t.Fatalf("queued pre-snapshot retry failed: %v", err)
	}
	for index, item := range retried.Items {
		if item.AnswerPartCount == nil {
			t.Fatalf("strict item %d lost its stored snapshot", index)
		}
	}

	legacyCurrent := snapshottedDiagnosticRun()
	legacyCurrent.Items = append([]NewRunItem(nil), legacyCurrent.Items...)
	for index := range legacyCurrent.Items {
		legacyCurrent.Items[index].AnswerPartCount = nil
	}
	if _, err := service.StartRun(ctx, userID, legacyCurrent); err != nil {
		t.Fatal(err)
	}
	currentRetry := legacyCurrent
	currentRetry.Items = append([]NewRunItem(nil), legacyCurrent.Items...)
	for index := range currentRetry.Items {
		count := int16(1)
		if index == 0 {
			count = 2
		}
		currentRetry.Items[index].AnswerPartCount = &count
	}
	legacyRetried, err := service.StartRun(ctx, userID, currentRetry)
	if err != nil {
		t.Fatalf("strict retry of legacy current assignment failed: %v", err)
	}
	for index, item := range legacyRetried.Items {
		if item.AnswerPartCount != nil {
			t.Fatalf("legacy item %d was upgraded in place", index)
		}
	}
}

func TestStartRunRejectsPartialStoredDiagnosticSnapshot(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update run_items set answer_part_count = null
		where id = $1 and user_id = $2
	`, run.Items[0].ID, userID); err != nil {
		t.Fatal(err)
	}
	queuedLegacy := run
	queuedLegacy.Items = append([]NewRunItem(nil), run.Items...)
	for index := range queuedLegacy.Items {
		queuedLegacy.Items[index].AnswerPartCount = nil
	}
	if _, err := service.StartRun(ctx, userID, queuedLegacy); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v", err)
	}
}
