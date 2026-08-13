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
		if normalized.Kind == RunKindSimulation && !existing.Run.DeadlineAt.Valid {
			existing.Run, err = queries.CanonicalizeSimulationDeadline(ctx, CanonicalizeSimulationDeadlineParams{
				DeadlineAt: requiredTime(*normalized.DeadlineAt),
				ID:         normalized.ID,
				UserID:     userID,
			})
			if errors.Is(err, pgx.ErrNoRows) {
				return RunAggregate{}, ErrConflict
			}
			if err != nil {
				return RunAggregate{}, classifyWriteError(err)
			}
			if err := tx.Commit(ctx); err != nil {
				return RunAggregate{}, err
			}
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
	tx, err := s.pool.BeginTx(ctx, pgx.TxOptions{
		IsoLevel:   pgx.RepeatableRead,
		AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return RunAggregate{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	aggregate, err := loadRun(ctx, s.queries.WithTx(tx), userID, runID)
	if err != nil {
		return RunAggregate{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return RunAggregate{}, err
	}
	return aggregate, nil
}

func (s *Service) ListRuns(ctx context.Context, userID uuid.UUID, limit int32) ([]RunAggregate, error) {
	if limit < 1 || limit > 100 {
		return nil, invalidInput("limit")
	}
	runs, err := s.queries.ListRuns(ctx, ListRunsParams{UserID: userID, Limit: limit})
	if err != nil {
		return nil, err
	}
	return loadRunAggregates(ctx, s.queries, userID, runs)
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
	return loadRunAggregates(ctx, s.queries, userID, runs)
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
	status := RunStatus(run.Status)
	if status != RunStatusActive && status != RunStatusSubmitted {
		return RunAggregate{}, ErrInvalidTransition
	}
	submission, err := normalizeRunSubmission(run, input, time.Now().UTC())
	if err != nil {
		return RunAggregate{}, err
	}
	if status == RunStatusSubmitted {
		if !sameRunSubmission(run, submission) {
			return RunAggregate{}, ErrConflict
		}
		if err := queries.DeleteRunCheckpoint(ctx, DeleteRunCheckpointParams{
			RunID: input.ID, UserID: userID,
		}); err != nil {
			return RunAggregate{}, err
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
	hasLaterAttempt, err := queries.RunHasAttemptAfter(ctx, RunHasAttemptAfterParams{
		RunID:       input.ID,
		UserID:      userID,
		SubmittedAt: requiredTime(submission.submittedAt),
	})
	if err != nil {
		return RunAggregate{}, err
	}
	if hasLaterAttempt {
		return RunAggregate{}, invalidInput("submittedAt")
	}

	if _, err := queries.SubmitRun(ctx, SubmitRunParams{
		ID:          input.ID,
		UserID:      userID,
		SubmittedAt: requiredTime(submission.submittedAt),
		DurationMs:  &submission.activeDurationMs,
	}); err != nil {
		return RunAggregate{}, classifyWriteError(err)
	}
	if err := queries.DeleteRunCheckpoint(ctx, DeleteRunCheckpointParams{
		RunID: input.ID, UserID: userID,
	}); err != nil {
		return RunAggregate{}, err
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
