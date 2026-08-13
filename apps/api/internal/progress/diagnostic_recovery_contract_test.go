package progress

import (
	"context"
	"sync"
	"testing"
	"time"
)

func TestSnapshottedDiagnosticRetryRepairsLegacyStaleCheckpoint(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	checkpoint, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
			{RunItemID: run.Items[0].ID, Answer: `["42",""]`},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	attempt := diagnosticAttempt(run, 0, run.StartedAt, run.StartedAt.Add(time.Minute))
	insertDiagnosticAttemptDirectly(t, userID, run, 0, attempt)

	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatalf("retry did not repair stale checkpoint: %v", err)
	}
	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.Version != checkpoint.Checkpoint.Version ||
		loaded.Checkpoint.Checkpoint.CurrentOrdinal != 2 || len(loaded.Checkpoint.Drafts) != 0 {
		t.Fatalf("stale checkpoint was not repaired: %+v", loaded.Checkpoint)
	}
}

func TestSnapshottedDiagnosticCheckpointRepairsLegacyStaleCheckpoint(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	checkpoint, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, CurrentOrdinal: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	attempt := diagnosticAttempt(run, 0, run.StartedAt, run.StartedAt.Add(time.Minute))
	insertDiagnosticAttemptDirectly(t, userID, run, 0, attempt)

	repaired, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, ExpectedVersion: checkpoint.Checkpoint.Version, CurrentOrdinal: 2,
	})
	if err != nil {
		t.Fatalf("current checkpoint did not repair stale state: %v", err)
	}
	if repaired.Checkpoint.Version != checkpoint.Checkpoint.Version+1 ||
		repaired.Checkpoint.CurrentOrdinal != 2 {
		t.Fatalf("unexpected repaired checkpoint: %+v", repaired)
	}
}

func TestSnapshottedDiagnosticConcurrentRepairCannotMoveCheckpointBackwards(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
		ID: run.ID, CurrentOrdinal: 1,
	}); err != nil {
		t.Fatal(err)
	}
	first := diagnosticAttempt(run, 0, run.StartedAt, run.StartedAt.Add(time.Minute))
	insertDiagnosticAttemptDirectly(t, userID, run, 0, first)
	second := diagnosticAttempt(
		run, 1, first.SubmittedAt, first.SubmittedAt.Add(time.Minute),
	)

	start := make(chan struct{})
	errorsByAttempt := make(chan error, 2)
	var writers sync.WaitGroup
	for _, attempt := range []RecordAttemptInput{first, second} {
		writers.Add(1)
		go func(attempt RecordAttemptInput) {
			defer writers.Done()
			<-start
			_, err := service.RecordAttempt(ctx, userID, attempt)
			errorsByAttempt <- err
		}(attempt)
	}
	close(start)
	writers.Wait()
	close(errorsByAttempt)
	for err := range errorsByAttempt {
		if err != nil {
			t.Fatalf("concurrent repair: %v", err)
		}
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.CurrentOrdinal != 3 ||
		len(loaded.Attempts) != 2 {
		t.Fatalf("concurrent repair moved checkpoint backwards: %+v", loaded)
	}
}
