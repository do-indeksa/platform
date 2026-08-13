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
	checkpoint, err := loadRunCheckpoint(ctx, queries, userID, runID)
	if err != nil {
		return RunAggregate{}, err
	}
	return RunAggregate{Run: run, Items: items, Attempts: attempts, Checkpoint: checkpoint}, nil
}

func loadRunCheckpoint(
	ctx context.Context,
	queries *Queries,
	userID, runID uuid.UUID,
) (*RunCheckpointAggregate, error) {
	rows, err := queries.ListRunCheckpointRows(ctx, ListRunCheckpointRowsParams{
		RunID: runID, UserID: userID,
	})
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	first := rows[0]
	checkpoint := RunCheckpoint{
		RunID: first.RunID, UserID: first.UserID, Version: first.Version,
		CurrentOrdinal: first.CurrentOrdinal, ActiveDurationMs: first.ActiveDurationMs,
		UpdatedAt: first.UpdatedAt,
	}
	drafts := make([]RunCheckpointDraft, 0, len(rows))
	for _, row := range rows {
		if row.RunID != checkpoint.RunID || row.UserID != checkpoint.UserID ||
			row.Version != checkpoint.Version || row.CurrentOrdinal != checkpoint.CurrentOrdinal ||
			!samePointer(row.ActiveDurationMs, checkpoint.ActiveDurationMs) ||
			!row.UpdatedAt.Equal(checkpoint.UpdatedAt) {
			return nil, fmt.Errorf("checkpoint projection changed within one query")
		}
		if !row.RunItemID.Valid && row.Answer == nil {
			continue
		}
		if !row.RunItemID.Valid || row.Answer == nil {
			return nil, fmt.Errorf("checkpoint draft projection is incomplete")
		}
		drafts = append(drafts, RunCheckpointDraft{
			RunID: row.RunID, RunItemID: uuid.UUID(row.RunItemID.Bytes), UserID: row.UserID,
			Answer: *row.Answer,
		})
	}
	return &RunCheckpointAggregate{Checkpoint: checkpoint, Drafts: drafts}, nil
}

func loadRunAggregates(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	runs []Run,
) ([]RunAggregate, error) {
	aggregates := make([]RunAggregate, len(runs))
	if len(runs) == 0 {
		return aggregates, nil
	}

	runIDs := make([]uuid.UUID, len(runs))
	runIndexes := make(map[uuid.UUID]int, len(runs))
	for index, run := range runs {
		runIDs[index] = run.ID
		runIndexes[run.ID] = index
		aggregates[index] = RunAggregate{Run: run, Items: []RunItem{}, Attempts: []Attempt{}}
	}
	items, err := queries.ListRunItemsByRunIDs(ctx, ListRunItemsByRunIDsParams{
		UserID: userID,
		RunIds: runIDs,
	})
	if err != nil {
		return nil, err
	}
	itemRunIndexes := make(map[uuid.UUID]int, len(items))
	for _, item := range items {
		index, ok := runIndexes[item.RunID]
		if !ok {
			return nil, fmt.Errorf("run item %s belongs to an unrequested run", item.ID)
		}
		aggregates[index].Items = append(aggregates[index].Items, item)
		itemRunIndexes[item.ID] = index
	}
	attempts, err := queries.ListLatestRunAttemptsByRunIDs(ctx, ListLatestRunAttemptsByRunIDsParams{
		RunIds: runIDs,
		UserID: userID,
	})
	if err != nil {
		return nil, err
	}
	for _, attempt := range attempts {
		if !attempt.RunItemID.Valid {
			return nil, fmt.Errorf("run attempt %s has no run item", attempt.PublicID)
		}
		itemID := uuid.UUID(attempt.RunItemID.Bytes)
		index, ok := itemRunIndexes[itemID]
		if !ok {
			return nil, fmt.Errorf("run attempt %s belongs to an unrequested item", attempt.PublicID)
		}
		aggregates[index].Attempts = append(aggregates[index].Attempts, attempt)
	}
	return aggregates, nil
}

func sameRunInput(existing RunAggregate, input StartRunInput) bool {
	if existing.Run.ID != input.ID || existing.Run.Kind != string(input.Kind) ||
		existing.Run.BlueprintVersion != input.BlueprintVersion ||
		existing.Run.ContentRevision != input.ContentRevision ||
		!existing.Run.StartedAt.Equal(input.StartedAt) ||
		!sameRunDeadline(existing.Run, input) ||
		len(existing.Items) != len(input.Items) {
		return false
	}
	for i, item := range input.Items {
		stored := existing.Items[i]
		if stored.ID != item.ID || stored.Ordinal != int16(i+1) || stored.TaskID != item.TaskID ||
			stored.ExamPosition != item.ExamPosition || stored.Topic != item.Topic ||
			stored.TaskRevision != item.TaskRevision || !samePointer(stored.MaxPoints, item.MaxPoints) ||
			!compatibleOptionalSnapshot(stored.AnswerPartCount, item.AnswerPartCount) {
			return false
		}
	}
	return true
}

func compatibleOptionalSnapshot[T comparable](stored, input *T) bool {
	return stored == nil || input == nil || *stored == *input
}

func sameRunDeadline(run Run, input StartRunInput) bool {
	if sameOptionalTime(run.DeadlineAt, input.DeadlineAt) {
		return true
	}
	return input.Kind == RunKindSimulation && !run.DeadlineAt.Valid && input.DeadlineAt != nil &&
		input.DeadlineAt.Equal(input.StartedAt.Add(p1SimulationDuration))
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
