package progress

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

func (s *Service) CheckpointRun(
	ctx context.Context,
	userID uuid.UUID,
	input CheckpointRunInput,
) (RunCheckpointAggregate, error) {
	if err := validateCheckpointInput(input); err != nil {
		return RunCheckpointAggregate{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RunCheckpointAggregate{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)

	run, err := queries.GetRunForUpdate(ctx, GetRunForUpdateParams{
		ID: input.ID, UserID: userID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return RunCheckpointAggregate{}, ErrNotFound
	}
	if err != nil {
		return RunCheckpointAggregate{}, err
	}
	if RunStatus(run.Status) != RunStatusActive {
		return RunCheckpointAggregate{}, ErrInvalidTransition
	}
	if RunKind(run.Kind) != RunKindDiagnostic && RunKind(run.Kind) != RunKindSimulation {
		return RunCheckpointAggregate{}, ErrInvalidTransition
	}
	if !validRunActiveDuration(RunKind(run.Kind), input.ActiveDurationMs, time.Since(run.StartedAt)) {
		return RunCheckpointAggregate{}, invalidInput("activeDurationMs")
	}

	items, err := queries.ListRunItems(ctx, ListRunItemsParams{
		RunID: input.ID, UserID: userID,
	})
	if err != nil {
		return RunCheckpointAggregate{}, err
	}
	if err := validateCheckpointItems(input, items); err != nil {
		return RunCheckpointAggregate{}, err
	}
	if err := validateSnapshottedDiagnosticCheckpoint(
		ctx, queries, userID, run, items, input,
	); err != nil {
		return RunCheckpointAggregate{}, err
	}

	existing, err := queries.GetRunCheckpointForUpdate(ctx, GetRunCheckpointForUpdateParams{
		RunID: input.ID, UserID: userID,
	})
	var checkpoint RunCheckpoint
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if input.ExpectedVersion != 0 {
			return RunCheckpointAggregate{}, ErrConflict
		}
		checkpoint, err = queries.CreateRunCheckpoint(ctx, CreateRunCheckpointParams{
			RunID: input.ID, UserID: userID,
			CurrentOrdinal:   input.CurrentOrdinal,
			ActiveDurationMs: input.ActiveDurationMs,
		})
	case err != nil:
		return RunCheckpointAggregate{}, err
	default:
		if input.ExpectedVersion != existing.Version || existing.Version == math.MaxInt64 {
			return RunCheckpointAggregate{}, ErrConflict
		}
		if existing.ActiveDurationMs != nil &&
			(input.ActiveDurationMs == nil || *input.ActiveDurationMs < *existing.ActiveDurationMs) {
			return RunCheckpointAggregate{}, invalidInput("activeDurationMs")
		}
		checkpoint, err = queries.UpdateRunCheckpoint(ctx, UpdateRunCheckpointParams{
			RunID: input.ID, UserID: userID, Version: input.ExpectedVersion,
			CurrentOrdinal:   input.CurrentOrdinal,
			ActiveDurationMs: input.ActiveDurationMs,
		})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return RunCheckpointAggregate{}, ErrConflict
	}
	if err != nil {
		return RunCheckpointAggregate{}, classifyWriteError(err)
	}

	if err := queries.DeleteRunCheckpointDrafts(ctx, DeleteRunCheckpointDraftsParams{
		RunID: input.ID, UserID: userID,
	}); err != nil {
		return RunCheckpointAggregate{}, err
	}
	for _, draft := range input.Drafts {
		if _, err := queries.CreateRunCheckpointDraft(ctx, CreateRunCheckpointDraftParams{
			RunID: input.ID, RunItemID: draft.RunItemID, UserID: userID, Answer: draft.Answer,
		}); err != nil {
			return RunCheckpointAggregate{}, classifyWriteError(err)
		}
	}
	if err := queries.TouchRun(ctx, TouchRunParams{ID: input.ID, UserID: userID}); err != nil {
		return RunCheckpointAggregate{}, err
	}
	drafts, err := queries.ListRunCheckpointDrafts(ctx, ListRunCheckpointDraftsParams{
		RunID: input.ID, UserID: userID,
	})
	if err != nil {
		return RunCheckpointAggregate{}, err
	}
	if drafts == nil {
		drafts = []RunCheckpointDraft{}
	}
	if err := tx.Commit(ctx); err != nil {
		return RunCheckpointAggregate{}, err
	}
	return RunCheckpointAggregate{Checkpoint: checkpoint, Drafts: drafts}, nil
}

func (s *Service) AbandonRun(
	ctx context.Context,
	userID uuid.UUID,
	input AbandonRunInput,
) (RunAggregate, error) {
	if input.ID == uuid.Nil {
		return RunAggregate{}, invalidInput("id")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return RunAggregate{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)

	run, err := queries.GetRunForUpdate(ctx, GetRunForUpdateParams{
		ID: input.ID, UserID: userID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return RunAggregate{}, ErrNotFound
	}
	if err != nil {
		return RunAggregate{}, err
	}
	switch RunStatus(run.Status) {
	case RunStatusSubmitted:
		return RunAggregate{}, ErrInvalidTransition
	case RunStatusActive:
		if _, err := queries.AbandonRun(ctx, AbandonRunParams{
			ID: input.ID, UserID: userID,
		}); err != nil {
			return RunAggregate{}, classifyWriteError(err)
		}
	case RunStatusAbandoned:
		// Idempotent retry also repairs an impossible leftover checkpoint.
	default:
		return RunAggregate{}, ErrInvalidTransition
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

func validateCheckpointItems(input CheckpointRunInput, items []RunItem) error {
	if len(items) == 0 || int(input.CurrentOrdinal) > len(items) || len(input.Drafts) > len(items) {
		return invalidInput("checkpoint")
	}
	itemIDs := make(map[uuid.UUID]struct{}, len(items))
	for _, item := range items {
		itemIDs[item.ID] = struct{}{}
	}
	for _, draft := range input.Drafts {
		if _, ok := itemIDs[draft.RunItemID]; !ok {
			return invalidInput("drafts.runItemId")
		}
	}
	return nil
}

func validateCheckpointInput(input CheckpointRunInput) error {
	if input.ID == uuid.Nil || input.ExpectedVersion < 0 ||
		input.CurrentOrdinal < 1 || input.CurrentOrdinal > maxRunItems ||
		len(input.Drafts) > int(MaxRunCheckpointDrafts) {
		return invalidInput("checkpoint")
	}
	seen := make(map[uuid.UUID]struct{}, len(input.Drafts))
	for _, draft := range input.Drafts {
		if draft.RunItemID == uuid.Nil || draft.Answer == "" || !validAnswerText(draft.Answer) {
			return invalidInput("drafts")
		}
		if _, duplicate := seen[draft.RunItemID]; duplicate {
			return invalidInput("drafts.runItemId")
		}
		seen[draft.RunItemID] = struct{}{}
	}
	return nil
}
