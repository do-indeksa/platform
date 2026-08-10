package progress

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

func loadRun(ctx context.Context, queries *Queries, userID, runID uuid.UUID) (RunAggregate, error) {
	run, err := queries.GetRun(ctx, GetRunParams{ID: runID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return RunAggregate{}, ErrNotFound
	}
	if err != nil {
		return RunAggregate{}, err
	}
	items, err := queries.ListRunItems(ctx, ListRunItemsParams{RunID: runID, UserID: userID})
	if err != nil {
		return RunAggregate{}, err
	}
	attempts, err := queries.ListRunAttempts(ctx, ListRunAttemptsParams{
		RunID:       runID,
		UserID:      userID,
		MaxAttempts: MaxRecentRunItemAttempts,
	})
	if err != nil {
		return RunAggregate{}, err
	}
	if items == nil {
		items = []RunItem{}
	}
	if attempts == nil {
		attempts = []Attempt{}
	}
	return RunAggregate{Run: run, Items: items, Attempts: attempts}, nil
}

func sameRunInput(existing RunAggregate, input StartRunInput) bool {
	if existing.Run.ID != input.ID || existing.Run.Kind != string(input.Kind) ||
		existing.Run.BlueprintVersion != input.BlueprintVersion ||
		existing.Run.ContentRevision != input.ContentRevision ||
		!existing.Run.StartedAt.Equal(input.StartedAt) ||
		!sameOptionalTime(existing.Run.DeadlineAt, input.DeadlineAt) ||
		len(existing.Items) != len(input.Items) {
		return false
	}
	for i, item := range input.Items {
		stored := existing.Items[i]
		if stored.ID != item.ID || stored.Ordinal != int16(i+1) || stored.TaskID != item.TaskID ||
			stored.ExamPosition != item.ExamPosition || stored.Topic != item.Topic ||
			stored.TaskRevision != item.TaskRevision || !samePointer(stored.MaxPoints, item.MaxPoints) {
			return false
		}
	}
	return true
}

func sameAttempt(attempt Attempt, input CreateAttemptParams) bool {
	return attempt.PublicID == input.PublicID && attempt.UserID == input.UserID &&
		attempt.TaskID == input.TaskID && attempt.Slot == input.Slot &&
		attempt.Correct == input.Correct && attempt.Source == input.Source &&
		attempt.HelpLevel == input.HelpLevel && sameUUID(attempt.RunItemID, input.RunItemID) &&
		sameTime(attempt.StartedAt, input.StartedAt) && sameTime(attempt.SubmittedAt, input.SubmittedAt) &&
		samePointer(attempt.ActiveDurationMs, input.ActiveDurationMs) && samePointer(attempt.Answer, input.Answer) &&
		samePointer(attempt.Outcome, input.Outcome) && samePointer(attempt.GradingKind, input.GradingKind) &&
		samePointer(attempt.EarnedPoints, input.EarnedPoints) && samePointer(attempt.MaxPoints, input.MaxPoints) &&
		samePointer(attempt.TaskRevision, input.TaskRevision)
}

func classifyWriteError(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) {
		switch postgresError.Code {
		case "23505":
			return fmt.Errorf("%w: uniqueness constraint", ErrConflict)
		case "23503", "23514":
			return fmt.Errorf("%w: database constraint", ErrInvalidInput)
		}
	}
	return err
}

func requiredTime(value time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: value, Valid: true}
}

func nullableTime(value *time.Time) pgtype.Timestamptz {
	if value == nil {
		return pgtype.Timestamptz{}
	}
	return requiredTime(*value)
}

func sameOptionalTime(stored pgtype.Timestamptz, input *time.Time) bool {
	if input == nil {
		return !stored.Valid
	}
	return stored.Valid && stored.Time.Equal(*input)
}

func sameTime(left, right pgtype.Timestamptz) bool {
	return left.Valid == right.Valid && (!left.Valid || left.Time.Equal(right.Time))
}

func sameUUID(left, right pgtype.UUID) bool {
	return left.Valid == right.Valid && (!left.Valid || left.Bytes == right.Bytes)
}

func samePointer[T comparable](left, right *T) bool {
	return (left == nil && right == nil) || (left != nil && right != nil && *left == *right)
}
