package progress

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestRunCheckpointLifecycle(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	duration := int64(20 * time.Minute / time.Millisecond)
	first, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID:               run.ID,
		ExpectedVersion:  0,
		CurrentOrdinal:   2,
		ActiveDurationMs: &duration,
		Drafts: []RunCheckpointDraftInput{
			{RunItemID: run.Items[1].ID, Answer: `["second"]`},
			{RunItemID: run.Items[0].ID, Answer: `["first"]`},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if first.Checkpoint.Version != 1 || first.Checkpoint.CurrentOrdinal != 2 ||
		len(first.Drafts) != 2 || first.Drafts[0].RunItemID != run.Items[0].ID ||
		first.Drafts[1].RunItemID != run.Items[1].ID {
		t.Fatalf("unexpected first checkpoint: %+v", first)
	}

	if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, ExpectedVersion: 0, CurrentOrdinal: 1,
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale checkpoint: got %v", err)
	}

	duration = int64(25 * time.Minute / time.Millisecond)
	second, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID:               run.ID,
		ExpectedVersion:  1,
		CurrentOrdinal:   1,
		ActiveDurationMs: &duration,
		Drafts: []RunCheckpointDraftInput{
			{RunItemID: run.Items[1].ID, Answer: `["updated"]`},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if second.Checkpoint.Version != 2 || len(second.Drafts) != 1 ||
		second.Drafts[0].Answer != `["updated"]` {
		t.Fatalf("checkpoint replacement failed: %+v", second)
	}

	decreased := int64(24 * time.Minute / time.Millisecond)
	if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, ExpectedVersion: 2, CurrentOrdinal: 1, ActiveDurationMs: &decreased,
	}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("decreasing active duration: got %v", err)
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.Version != 2 ||
		len(loaded.Checkpoint.Drafts) != 1 || loaded.Checkpoint.Drafts[0].Answer != `["updated"]` {
		t.Fatalf("stale or invalid write changed checkpoint: %+v", loaded.Checkpoint)
	}

	submitted, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: run.ID, SubmittedAt: run.StartedAt.Add(45 * time.Minute),
	})
	if err != nil {
		t.Fatal(err)
	}
	if submitted.Checkpoint != nil {
		t.Fatalf("submitted run retained checkpoint: %+v", submitted.Checkpoint)
	}
	if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, ExpectedVersion: 2, CurrentOrdinal: 1,
	}); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("checkpoint after submit: got %v", err)
	}
}

func TestRunCheckpointOwnershipAndAbandonment(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	ownerID := seedProgressUser(t, "-owner")
	otherID := seedProgressUser(t, "-other")
	run := sampleRunInput(RunKindSimulation)
	if _, err := service.StartRun(ctx, ownerID, run); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CheckpointRun(ctx, ownerID, CheckpointRunInput{
		ID: run.ID, ExpectedVersion: 0, CurrentOrdinal: 1,
		Drafts: []RunCheckpointDraftInput{{RunItemID: run.Items[0].ID, Answer: `["42"]`}},
	}); err != nil {
		t.Fatal(err)
	}

	if _, err := service.CheckpointRun(ctx, otherID, CheckpointRunInput{
		ID: run.ID, ExpectedVersion: 1, CurrentOrdinal: 1,
	}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-owner checkpoint: got %v", err)
	}
	if _, err := service.AbandonRun(ctx, otherID, AbandonRunInput{ID: run.ID}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-owner abandon: got %v", err)
	}

	abandoned, err := service.AbandonRun(ctx, ownerID, AbandonRunInput{ID: run.ID})
	if err != nil {
		t.Fatal(err)
	}
	if abandoned.Run.Status != string(RunStatusAbandoned) || abandoned.Checkpoint != nil {
		t.Fatalf("unexpected abandoned run: %+v", abandoned)
	}
	retried, err := service.AbandonRun(ctx, ownerID, AbandonRunInput{ID: run.ID})
	if err != nil || retried.Run.Status != string(RunStatusAbandoned) {
		t.Fatalf("idempotent abandon failed: %+v %v", retried, err)
	}
	if _, err := service.CheckpointRun(ctx, ownerID, CheckpointRunInput{
		ID: run.ID, ExpectedVersion: 1, CurrentOrdinal: 1,
	}); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("checkpoint after abandon: got %v", err)
	}
	if _, err := service.SubmitRun(ctx, ownerID, SubmitRunInput{ID: run.ID}); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("submit after abandon: got %v", err)
	}
}

func TestRunCheckpointRejectsInvalidDrafts(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name  string
		input CheckpointRunInput
	}{
		{
			name: "unknown item",
			input: CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
				{RunItemID: uuid.New(), Answer: "42"},
			}},
		},
		{
			name: "duplicate item",
			input: CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
				{RunItemID: run.Items[0].ID, Answer: "42"},
				{RunItemID: run.Items[0].ID, Answer: "43"},
			}},
		},
		{
			name: "empty answer",
			input: CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
				{RunItemID: run.Items[0].ID, Answer: ""},
			}},
		},
		{
			name: "oversized answer",
			input: CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
				{RunItemID: run.Items[0].ID, Answer: strings.Repeat("x", maxAnswerCharacters+1)},
			}},
		},
		{
			name: "null byte",
			input: CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
				{RunItemID: run.Items[0].ID, Answer: "before\x00after"},
			}},
		},
		{
			name: "invalid utf8",
			input: CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
				{RunItemID: run.Items[0].ID, Answer: string([]byte{'b', 'a', 'd', 0xff})},
			}},
		},
		{name: "unknown ordinal", input: CheckpointRunInput{ID: run.ID, CurrentOrdinal: 3}},
		{name: "negative version", input: CheckpointRunInput{ID: run.ID, ExpectedVersion: -1, CurrentOrdinal: 1}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := service.CheckpointRun(ctx, userID, test.input); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint != nil {
		t.Fatalf("invalid input created checkpoint: %+v", loaded.Checkpoint)
	}
}

func TestPracticeRunRejectsCheckpoint(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, CurrentOrdinal: 1,
	}); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("practice checkpoint: got %v", err)
	}
}

func TestRunCheckpointCompareAndSwapIsConcurrent(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindDiagnostic)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	start := make(chan struct{})
	errorsByWriter := make(chan error, 2)
	var writers sync.WaitGroup
	for _, answer := range []string{"first", "second"} {
		writers.Add(1)
		go func(answer string) {
			defer writers.Done()
			<-start
			_, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
				ID: run.ID, ExpectedVersion: 0, CurrentOrdinal: 1,
				Drafts: []RunCheckpointDraftInput{{RunItemID: run.Items[0].ID, Answer: answer}},
			})
			errorsByWriter <- err
		}(answer)
	}
	close(start)
	writers.Wait()
	close(errorsByWriter)

	var successes, conflicts int
	for err := range errorsByWriter {
		switch {
		case err == nil:
			successes++
		case errors.Is(err, ErrConflict):
			conflicts++
		default:
			t.Fatalf("unexpected writer error: %v", err)
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("successes=%d conflicts=%d", successes, conflicts)
	}
	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.Version != 1 ||
		len(loaded.Checkpoint.Drafts) != 1 {
		t.Fatalf("unexpected concurrent result: %+v", loaded.Checkpoint)
	}
}
