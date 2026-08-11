package progress

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) StartRun(ctx context.Context, userID uuid.UUID, input StartRunInput) (RunAggregate, error) {
	normalized, err := normalizeStartRun(input, time.Now().UTC())
	if err != nil {
		return RunAggregate{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RunAggregate{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)

	run, err := queries.CreateRun(ctx, CreateRunParams{
		ID:               normalized.ID,
		UserID:           userID,
		Kind:             string(normalized.Kind),
		BlueprintVersion: normalized.BlueprintVersion,
		ContentRevision:  normalized.ContentRevision,
		StartedAt:        normalized.StartedAt,
		DeadlineAt:       nullableTime(normalized.DeadlineAt),
	})
	if errors.Is(err, pgx.ErrNoRows) {
		existing, loadErr := loadRun(ctx, queries, userID, normalized.ID)
		if errors.Is(loadErr, ErrNotFound) {
			return RunAggregate{}, ErrConflict
		}
		if loadErr != nil {
			return RunAggregate{}, loadErr
		}
		if !sameRunInput(existing, normalized) {
			return RunAggregate{}, ErrConflict
		}
		return existing, nil
	}
	if err != nil {
		return RunAggregate{}, classifyWriteError(err)
	}

	items := make([]RunItem, len(normalized.Items))
	for i, item := range normalized.Items {
		items[i], err = queries.CreateRunItem(ctx, CreateRunItemParams{
			ID:           item.ID,
			RunID:        run.ID,
			UserID:       userID,
			TaskID:       item.TaskID,
			Ordinal:      int16(i + 1),
			ExamPosition: item.ExamPosition,
			Topic:        item.Topic,
			MaxPoints:    item.MaxPoints,
			TaskRevision: item.TaskRevision,
		})
		if err != nil {
			return RunAggregate{}, classifyWriteError(err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return RunAggregate{}, err
	}
	return RunAggregate{Run: run, Items: items, Attempts: []Attempt{}}, nil
}

func (s *Service) GetRun(ctx context.Context, userID, runID uuid.UUID) (RunAggregate, error) {
	return loadRun(ctx, s.queries, userID, runID)
}

func (s *Service) ListRuns(ctx context.Context, userID uuid.UUID, limit int32) ([]Run, error) {
	if limit < 1 || limit > 100 {
		return nil, invalidInput("limit")
	}
	runs, err := s.queries.ListRuns(ctx, ListRunsParams{UserID: userID, Limit: limit})
	if runs == nil {
		runs = []Run{}
	}
	return runs, err
}

func (s *Service) ListCompletedSimulationRuns(
	ctx context.Context,
	userID uuid.UUID,
	limit int32,
) ([]RunAggregate, error) {
	if limit < 1 || limit > MaxCompletedSimulationRuns {
		return nil, invalidInput("limit")
	}
	runs, err := s.queries.ListCompletedSimulationRuns(ctx, ListCompletedSimulationRunsParams{
		UserID: userID,
		Limit:  limit,
	})
	if err != nil {
		return nil, err
	}
	return loadCompletedSimulationRuns(ctx, s.queries, userID, runs)
}

func (s *Service) SubmitRun(ctx context.Context, userID uuid.UUID, input SubmitRunInput) (RunAggregate, error) {
	if input.ID == uuid.Nil {
		return RunAggregate{}, invalidInput("id")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RunAggregate{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)

	run, err := queries.GetRunForUpdate(ctx, GetRunForUpdateParams{ID: input.ID, UserID: userID})
	if errors.Is(err, pgx.ErrNoRows) {
		return RunAggregate{}, ErrNotFound
	}
	if err != nil {
		return RunAggregate{}, err
	}
	if RunStatus(run.Status) == RunStatusSubmitted {
		return loadRun(ctx, queries, userID, input.ID)
	}
	if RunStatus(run.Status) != RunStatusActive {
		return RunAggregate{}, ErrInvalidTransition
	}
	submittedAt, err := normalizeClientTime(input.SubmittedAt, time.Now().UTC(), "submittedAt")
	if err != nil {
		return RunAggregate{}, err
	}
	if submittedAt.Before(run.StartedAt) {
		return RunAggregate{}, invalidInput("submittedAt")
	}
	if !validActiveDuration(input.ActiveDurationMs, submittedAt.Sub(run.StartedAt)) {
		return RunAggregate{}, invalidInput("activeDurationMs")
	}
	duration := input.ActiveDurationMs
	if duration == nil {
		elapsed := submittedAt.Sub(run.StartedAt).Milliseconds()
		duration = &elapsed
	}

	if _, err := queries.SubmitRun(ctx, SubmitRunParams{
		ID:          input.ID,
		UserID:      userID,
		SubmittedAt: requiredTime(submittedAt),
		DurationMs:  duration,
	}); err != nil {
		return RunAggregate{}, classifyWriteError(err)
	}
	aggregate, err := loadRun(ctx, queries, userID, input.ID)
	if err != nil {
		return RunAggregate{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return RunAggregate{}, err
	}
	return aggregate, nil
}
