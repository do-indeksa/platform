package progress

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

const (
	minPrepExamDate = "2000-01-01"
	maxPrepExamDate = "9999-12-31"
)

func (s *Service) GetPrepPreferences(
	ctx context.Context,
	userID uuid.UUID,
) (PrepPreferences, error) {
	if userID == uuid.Nil {
		return PrepPreferences{}, invalidInput("userId")
	}
	stored, err := s.queries.GetPrepPreferences(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return PrepPreferences{}, ErrNotFound
	}
	if err != nil {
		return PrepPreferences{}, err
	}
	return prepPreferencesFromRow(stored)
}

func (s *Service) SavePrepPreferences(
	ctx context.Context,
	userID uuid.UUID,
	input SavePrepPreferencesInput,
) (PrepPreferences, error) {
	examDate, err := normalizePrepPreferencesInput(userID, input)
	if err != nil {
		return PrepPreferences{}, err
	}
	date := pgtype.Date{Time: examDate, Valid: true}
	var stored PrepPreference
	if input.ExpectedVersion == 0 {
		stored, err = s.queries.CreatePrepPreferences(ctx, CreatePrepPreferencesParams{
			UserID:     userID,
			GoalPoints: input.GoalPoints,
			ExamDate:   date,
		})
	} else {
		stored, err = s.queries.UpdatePrepPreferences(ctx, UpdatePrepPreferencesParams{
			UserID:          userID,
			ExpectedVersion: input.ExpectedVersion,
			GoalPoints:      input.GoalPoints,
			ExamDate:        date,
		})
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return PrepPreferences{}, ErrConflict
	}
	if err != nil {
		return PrepPreferences{}, classifyWriteError(err)
	}
	return prepPreferencesFromRow(stored)
}

func normalizePrepPreferencesInput(
	userID uuid.UUID,
	input SavePrepPreferencesInput,
) (time.Time, error) {
	if userID == uuid.Nil || input.ExpectedVersion < 0 ||
		input.GoalPoints < 1 || input.GoalPoints > 60 ||
		len(input.ExamDate) != len(time.DateOnly) ||
		input.ExamDate < minPrepExamDate || input.ExamDate > maxPrepExamDate {
		return time.Time{}, invalidInput("preferences")
	}
	examDate, err := time.Parse(time.DateOnly, input.ExamDate)
	if err != nil || examDate.Format(time.DateOnly) != input.ExamDate {
		return time.Time{}, invalidInput("examDate")
	}
	return examDate, nil
}

func prepPreferencesFromRow(stored PrepPreference) (PrepPreferences, error) {
	if stored.UserID == uuid.Nil || stored.GoalPoints < 1 || stored.GoalPoints > 60 ||
		!stored.ExamDate.Valid || stored.Version < 1 || stored.CreatedAt.IsZero() ||
		stored.UpdatedAt.Before(stored.CreatedAt) {
		return PrepPreferences{}, errors.New("stored prep preferences violate invariants")
	}
	examDate := stored.ExamDate.Time.UTC()
	formatted := examDate.Format(time.DateOnly)
	if formatted < minPrepExamDate || formatted > maxPrepExamDate {
		return PrepPreferences{}, errors.New("stored prep exam date violates invariants")
	}
	return PrepPreferences{
		UserID:     stored.UserID,
		GoalPoints: stored.GoalPoints,
		ExamDate:   examDate,
		Version:    stored.Version,
		CreatedAt:  stored.CreatedAt,
		UpdatedAt:  stored.UpdatedAt,
	}, nil
}
