package progress

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSnapshottedDiagnosticSubmissionRequiresCompletePrefix(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedDiagnosticRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: run.ID, SubmittedAt: run.StartedAt.Add(time.Minute),
	}); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("incomplete submission: got %v", err)
	}
	lastSubmittedAt := recordDiagnosticPrefix(ctx, t, service, userID, run, len(run.Items))
	submitted, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: run.ID, SubmittedAt: lastSubmittedAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	if submitted.Run.Status != string(RunStatusSubmitted) || len(submitted.Attempts) != len(run.Items) {
		t.Fatalf("unexpected submitted run: %+v", submitted)
	}
}

func TestSnapshottedDiagnosticWritesRejectPartialStoredSnapshot(t *testing.T) {
	tests := []struct {
		name  string
		write func(context.Context, *Service, uuid.UUID, StartRunInput) error
	}{
		{
			name: "attempt",
			write: func(ctx context.Context, service *Service, userID uuid.UUID, run StartRunInput) error {
				_, err := service.RecordAttempt(ctx, userID, diagnosticAttempt(
					run, 0, run.StartedAt, run.StartedAt.Add(time.Minute),
				))
				return err
			},
		},
		{
			name: "checkpoint",
			write: func(ctx context.Context, service *Service, userID uuid.UUID, run StartRunInput) error {
				_, err := service.CheckpointRun(ctx, userID, CheckpointRunInput{
					ID: run.ID, CurrentOrdinal: 1,
				})
				return err
			},
		},
		{
			name: "submission",
			write: func(ctx context.Context, service *Service, userID uuid.UUID, run StartRunInput) error {
				_, err := service.SubmitRun(ctx, userID, SubmitRunInput{
					ID: run.ID, SubmittedAt: run.StartedAt.Add(time.Minute),
				})
				return err
			},
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
			if _, err := testPool.Exec(ctx, `
				update run_items set answer_part_count = null
				where id = $1 and user_id = $2
			`, run.Items[0].ID, userID); err != nil {
				t.Fatal(err)
			}
			if err := test.write(ctx, service, userID, run); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}
