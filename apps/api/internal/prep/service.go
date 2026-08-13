package prep

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	queries *Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: New(pool)}
}

func (s *Service) Get(ctx context.Context, userID uuid.UUID) (Preferences, error) {
	if userID == uuid.Nil {
		return Preferences{}, invalidInput("user")
	}
	row, err := s.queries.GetPreferences(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Preferences{}, ErrNotFound
	}
	if err != nil {
		return Preferences{}, err
	}
	return preferencesFromGet(row), nil
}

func (s *Service) Save(
	ctx context.Context,
	userID uuid.UUID,
	input SaveInput,
) (Preferences, error) {
	if err := validateSaveInput(userID, input); err != nil {
		return Preferences{}, err
	}

	goalPoints := int16(input.GoalPoints)
	examDate, _ := time.Parse(calendarDateLayout, input.ExamDate)
	databaseDate := pgtype.Date{Time: examDate, Valid: true}
	if input.ExpectedVersion == 0 {
		row, err := s.queries.CreatePreferences(ctx, CreatePreferencesParams{
			UserID: userID, GoalPoints: goalPoints, ExamDate: databaseDate,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return Preferences{}, ErrConflict
		}
		if err != nil {
			return Preferences{}, err
		}
		return Preferences{
			GoalPoints: int32(row.GoalPoints), ExamDate: row.ExamDate,
			Version: row.Version, UpdatedAt: row.UpdatedAt,
		}, nil
	}

	row, err := s.queries.UpdatePreferences(ctx, UpdatePreferencesParams{
		UserID: userID, GoalPoints: goalPoints, ExamDate: databaseDate,
		ExpectedVersion: input.ExpectedVersion,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return Preferences{}, ErrConflict
	}
	if err != nil {
		return Preferences{}, err
	}
	return Preferences{
		GoalPoints: int32(row.GoalPoints), ExamDate: row.ExamDate,
		Version: row.Version, UpdatedAt: row.UpdatedAt,
	}, nil
}

func validateSaveInput(userID uuid.UUID, input SaveInput) error {
	if userID == uuid.Nil || input.ExpectedVersion < 0 ||
		input.GoalPoints < MinGoalPoints || input.GoalPoints > MaxGoalPoints {
		return invalidInput("preferences")
	}
	if len(input.ExamDate) != len(calendarDateLayout) {
		return invalidInput("examDate")
	}
	date, err := time.Parse(calendarDateLayout, input.ExamDate)
	if err != nil || date.Year() < 1 || date.Year() > 9999 ||
		date.Format(calendarDateLayout) != input.ExamDate {
		return invalidInput("examDate")
	}
	return nil
}

func preferencesFromGet(row GetPreferencesRow) Preferences {
	return Preferences{
		GoalPoints: int32(row.GoalPoints), ExamDate: row.ExamDate,
		Version: row.Version, UpdatedAt: row.UpdatedAt,
	}
}

func invalidInput(field string) error {
	return fmt.Errorf("%w: %s", ErrInvalidInput, field)
}
