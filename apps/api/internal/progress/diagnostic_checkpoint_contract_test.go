package progress

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestSnapshottedDiagnosticCheckpointTracksNextItem(t *testing.T) {
	tests := []struct {
		name    string
		input   func(StartRunInput) CheckpointRunInput
		prefix  int
		wantErr error
	}{
		{
			name: "future ordinal",
			input: func(run StartRunInput) CheckpointRunInput {
				return CheckpointRunInput{ID: run.ID, CurrentOrdinal: 2}
			},
			wantErr: ErrInvalidInput,
		},
		{
			name: "multiple drafts",
			input: func(run StartRunInput) CheckpointRunInput {
				return CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
					{RunItemID: run.Items[0].ID, Answer: `["42",""]`},
					{RunItemID: run.Items[1].ID, Answer: `["42"]`},
				}}
			},
			wantErr: ErrInvalidInput,
		},
		{
			name: "wrong draft item",
			input: func(run StartRunInput) CheckpointRunInput {
				return CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
					{RunItemID: run.Items[1].ID, Answer: `["42"]`},
				}}
			},
			wantErr: ErrInvalidInput,
		},
		{
			name: "wrong draft shape",
			input: func(run StartRunInput) CheckpointRunInput {
				return CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1, Drafts: []RunCheckpointDraftInput{
					{RunItemID: run.Items[0].ID, Answer: `["42"]`},
				}}
			},
			wantErr: ErrInvalidInput,
		},
		{
			name:   "completed ordinal",
			prefix: 1,
			input: func(run StartRunInput) CheckpointRunInput {
				return CheckpointRunInput{ID: run.ID, CurrentOrdinal: 1}
			},
			wantErr: ErrConflict,
		},
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
			recordDiagnosticPrefix(ctx, t, service, userID, run, test.prefix)
			if _, err := service.CheckpointRun(ctx, userID, test.input(run)); !errors.Is(err, test.wantErr) {
				t.Fatalf("got %v", err)
			}
		})
	}

	t.Run("valid current draft", func(t *testing.T) {
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
		if checkpoint.Checkpoint.Version != 1 || len(checkpoint.Drafts) != 1 {
			t.Fatalf("unexpected checkpoint: %+v", checkpoint)
		}

		attempt := diagnosticAttempt(run, 0, run.StartedAt, run.StartedAt.Add(time.Minute))
		if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
			t.Fatal(err)
		}
		loaded, err := service.GetRun(ctx, userID, run.ID)
		if err != nil {
			t.Fatal(err)
		}
		if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.Version != 1 ||
			loaded.Checkpoint.Checkpoint.CurrentOrdinal != 2 || len(loaded.Checkpoint.Drafts) != 0 {
			t.Fatalf("attempt did not canonicalize checkpoint: %+v", loaded.Checkpoint)
		}
		canonicalizedAt := loaded.Checkpoint.Checkpoint.UpdatedAt
		if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
			t.Fatalf("attempt retry: %v", err)
		}
		loaded, err = service.GetRun(ctx, userID, run.ID)
		if err != nil {
			t.Fatal(err)
		}
		if loaded.Checkpoint == nil || loaded.Checkpoint.Checkpoint.Version != 1 ||
			loaded.Checkpoint.Checkpoint.CurrentOrdinal != 2 ||
			!loaded.Checkpoint.Checkpoint.UpdatedAt.Equal(canonicalizedAt) {
			t.Fatalf("attempt retry changed checkpoint: %+v", loaded.Checkpoint)
		}
		if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
			ID: run.ID, ExpectedVersion: 1, CurrentOrdinal: 2,
		}); err != nil {
			t.Fatalf("next checkpoint lost CAS continuity: %v", err)
		}
	})

	t.Run("stale ordinal is a conflict", func(t *testing.T) {
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
		if _, err := service.RecordAttempt(ctx, userID, diagnosticAttempt(
			run, 0, run.StartedAt, run.StartedAt.Add(time.Minute),
		)); err != nil {
			t.Fatal(err)
		}
		if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
			ID: run.ID, ExpectedVersion: 1, CurrentOrdinal: 1,
		}); !errors.Is(err, ErrConflict) {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("stale initial checkpoint is a conflict", func(t *testing.T) {
		ctx := context.Background()
		service := NewService(testPool)
		userID := seedProgressUser(t, "")
		run := snapshottedDiagnosticRun()
		if _, err := service.StartRun(ctx, userID, run); err != nil {
			t.Fatal(err)
		}
		if _, err := service.RecordAttempt(ctx, userID, diagnosticAttempt(
			run, 0, run.StartedAt, run.StartedAt.Add(time.Minute),
		)); err != nil {
			t.Fatal(err)
		}
		if _, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
			ID: run.ID, ExpectedVersion: 0, CurrentOrdinal: 1,
		}); !errors.Is(err, ErrConflict) {
			t.Fatalf("got %v", err)
		}
	})

	t.Run("final attempt consumes final draft", func(t *testing.T) {
		ctx := context.Background()
		service := NewService(testPool)
		userID := seedProgressUser(t, "")
		run := snapshottedDiagnosticRun()
		if _, err := service.StartRun(ctx, userID, run); err != nil {
			t.Fatal(err)
		}
		previousSubmittedAt := recordDiagnosticPrefix(
			ctx, t, service, userID, run, len(run.Items)-1,
		)
		checkpoint, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
			ID: run.ID, CurrentOrdinal: int16(len(run.Items)), Drafts: []RunCheckpointDraftInput{
				{RunItemID: run.Items[len(run.Items)-1].ID, Answer: `["42"]`},
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		last := diagnosticAttempt(
			run, len(run.Items)-1, previousSubmittedAt, previousSubmittedAt.Add(time.Minute),
		)
		if _, err := service.RecordAttempt(ctx, userID, last); err != nil {
			t.Fatal(err)
		}
		loaded, err := service.GetRun(ctx, userID, run.ID)
		if err != nil {
			t.Fatal(err)
		}
		if loaded.Checkpoint == nil ||
			loaded.Checkpoint.Checkpoint.Version != checkpoint.Checkpoint.Version ||
			loaded.Checkpoint.Checkpoint.CurrentOrdinal != int16(len(run.Items)) ||
			len(loaded.Checkpoint.Drafts) != 0 {
			t.Fatalf("final draft was not consumed: %+v", loaded.Checkpoint)
		}
	})
}
