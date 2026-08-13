package progress

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestSnapshottedPracticeCheckpointAndDraftConsumption(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 2)
	written, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{practiceDraft(run, 0, 1, 1)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if written.Checkpoint.Version != 1 || len(written.Drafts) != 1 {
		t.Fatalf("checkpoint: %+v", written)
	}

	mismatch := practiceAttempt(run, 0, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0)
	if _, err := service.RecordAttempt(ctx, userID, mismatch); !errors.Is(err, ErrConflict) {
		t.Fatalf("draft mismatch: %v", err)
	}
	match := mismatch
	match.HelpLevel = 1
	if _, err := service.RecordAttempt(ctx, userID, match); err != nil {
		t.Fatal(err)
	}
	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.Version != 1 || len(loaded.Checkpoint.Drafts) != 0 {
		t.Fatalf("draft not consumed: %+v", loaded.Checkpoint)
	}
}

func TestSnapshottedPracticeRepairsStaleConsumedDraft(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 1)
	checkpoint, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{practiceDraft(run, 0, 1, 0)},
	})
	if err != nil {
		t.Fatal(err)
	}
	attempt := practiceAttempt(run, 0, 1, run.StartedAt, run.StartedAt.Add(time.Minute), AttemptOutcomeIncorrect, 0)
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		insert into run_checkpoint_drafts (run_id, run_item_id, user_id, answer)
		values ($1, $2, $3, $4)
	`, run.ID, run.Items[0].ID, userID, practiceDraft(run, 0, 1, 0).Answer); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatalf("stale retry: %v", err)
	}
	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.Version != checkpoint.Checkpoint.Version || len(loaded.Checkpoint.Drafts) != 0 {
		t.Fatalf("stale draft not repaired: %+v", loaded.Checkpoint)
	}
}

func TestSnapshottedPracticeRejectsMalformedCheckpoint(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := startPracticeRun(t, service, userID, 1)
	tests := []string{
		`{"version":1,"nextAttempt":1,"answers":["one","two"],"helpLevel":0}`,
		`{"version":2,"nextAttempt":1,"answers":["one"],"helpLevel":0}`,
		`{"version":1,"nextAttempt":21,"answers":["one"],"helpLevel":0}`,
		`{"version":1,"nextAttempt":1,"answers":["one"],"helpLevel":0,"extra":true}`,
	}
	for _, raw := range tests {
		_, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
			ID: run.ID, CurrentOrdinal: 1,
			Drafts: []RunCheckpointDraftInput{{RunItemID: run.Items[0].ID, Answer: raw}},
		})
		if !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("%s: %v", raw, err)
		}
	}
}
