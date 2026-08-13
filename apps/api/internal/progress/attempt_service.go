package progress

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

func (s *Service) RecordAttempt(ctx context.Context, userID uuid.UUID, input RecordAttemptInput) (Attempt, error) {
	normalized, err := normalizeAttempt(input, time.Now().UTC())
	if err != nil {
		return Attempt{}, err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Attempt{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	queries := s.queries.WithTx(tx)

	existing, existingErr := queries.GetAttempt(ctx, GetAttemptParams{PublicID: normalized.ID, UserID: userID})
	hasExisting := existingErr == nil
	if existingErr != nil && !errors.Is(existingErr, pgx.ErrNoRows) {
		return Attempt{}, existingErr
	}
	target, err := resolveAttemptTarget(ctx, queries, userID, normalized)
	if err != nil {
		return Attempt{}, err
	}
	if err := validateAttemptScore(normalized.Outcome, normalized.EarnedPoints, target.maxPoints); err != nil {
		return Attempt{}, err
	}
	if !validRunActiveDuration(
		target.mode,
		normalized.ActiveDurationMs,
		normalized.SubmittedAt.Sub(normalized.StartedAt),
	) {
		return Attempt{}, invalidInput("activeDurationMs")
	}

	outcome := string(normalized.Outcome)
	gradingKind := string(normalized.GradingKind)
	taskRevision := target.taskRevision
	params := CreateAttemptParams{
		PublicID:         normalized.ID,
		UserID:           userID,
		RunItemID:        target.runItemID,
		TaskID:           target.taskID,
		Slot:             int32(target.examPosition),
		Correct:          normalized.Outcome == AttemptOutcomeCorrect,
		Source:           string(target.mode),
		HelpLevel:        normalized.HelpLevel,
		CreatedAt:        normalized.SubmittedAt,
		StartedAt:        requiredTime(normalized.StartedAt),
		SubmittedAt:      requiredTime(normalized.SubmittedAt),
		ActiveDurationMs: normalized.ActiveDurationMs,
		Answer:           normalized.Answer,
		Outcome:          &outcome,
		GradingKind:      &gradingKind,
		EarnedPoints:     normalized.EarnedPoints,
		MaxPoints:        target.maxPoints,
		TaskRevision:     &taskRevision,
	}
	if hasExisting {
		if !sameAttempt(existing, params) {
			return Attempt{}, ErrConflict
		}
		return existing, nil
	}
	if target.runItemID.Valid && target.runStatus != RunStatusActive {
		return Attempt{}, ErrInvalidTransition
	}
	attempt, err := queries.CreateAttempt(ctx, params)
	if errors.Is(err, pgx.ErrNoRows) {
		existing, getErr := queries.GetAttempt(ctx, GetAttemptParams{PublicID: normalized.ID, UserID: userID})
		if errors.Is(getErr, pgx.ErrNoRows) {
			return Attempt{}, ErrConflict
		}
		if getErr != nil {
			return Attempt{}, getErr
		}
		if !sameAttempt(existing, params) {
			return Attempt{}, ErrConflict
		}
		return existing, nil
	}
	if err != nil {
		return Attempt{}, classifyWriteError(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Attempt{}, err
	}
	return attempt, nil
}

func (s *Service) ListAttemptJournal(ctx context.Context, userID uuid.UUID, limit int32) ([]Attempt, error) {
	if limit < 1 || limit > MaxAttemptJournalEntries {
		return nil, invalidInput("limit")
	}
	attempts, err := s.queries.ListAttemptJournal(ctx, ListAttemptJournalParams{
		UserID:      userID,
		MaxAttempts: limit,
	})
	if err != nil {
		return nil, err
	}
	if attempts == nil {
		return []Attempt{}, nil
	}
	return attempts, nil
}

type attemptTarget struct {
	runItemID    pgtype.UUID
	runStatus    RunStatus
	taskID       string
	examPosition int16
	mode         RunKind
	maxPoints    *int16
	taskRevision string
}

func resolveAttemptTarget(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	input RecordAttemptInput,
) (attemptTarget, error) {
	if input.RunItemID != nil {
		row, err := queries.GetRunItemTarget(ctx, GetRunItemTargetParams{ID: *input.RunItemID, UserID: userID})
		if errors.Is(err, pgx.ErrNoRows) {
			return attemptTarget{}, ErrNotFound
		}
		if err != nil {
			return attemptTarget{}, err
		}
		return attemptTarget{
			runItemID:    pgtype.UUID{Bytes: *input.RunItemID, Valid: true},
			runStatus:    RunStatus(row.RunStatus),
			taskID:       row.TaskID,
			examPosition: row.ExamPosition,
			mode:         RunKind(row.RunKind),
			maxPoints:    row.ItemMaxPoints,
			taskRevision: row.TaskRevision,
		}, nil
	}
	target := input.Standalone
	if target == nil || !validTaskID(target.TaskID) || target.ExamPosition < 1 ||
		target.ExamPosition > 10 || !validRevision(target.TaskRevision) {
		return attemptTarget{}, invalidInput("standalone")
	}
	if target.MaxPoints != nil && (*target.MaxPoints < 1 || *target.MaxPoints > 60) {
		return attemptTarget{}, invalidInput("standalone.maxPoints")
	}
	return attemptTarget{
		taskID:       target.TaskID,
		examPosition: target.ExamPosition,
		mode:         RunKindPractice,
		maxPoints:    target.MaxPoints,
		taskRevision: target.TaskRevision,
	}, nil
}
