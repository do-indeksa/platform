package training

import (
	"context"
	"errors"
	"fmt"
	"regexp"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var blueprintVersionPattern = regexp.MustCompile(`^[0-9]{4}[.][0-9]+$`)

type Service struct {
	queries *Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: New(pool)}
}

func (s *Service) GetBuilderDraft(
	ctx context.Context,
	userID uuid.UUID,
) (BuilderDraft, error) {
	if userID == uuid.Nil {
		return BuilderDraft{}, invalidInput("user")
	}
	row, err := s.queries.GetBuilderDraft(ctx, userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return BuilderDraft{}, ErrNotFound
	}
	if err != nil {
		return BuilderDraft{}, err
	}
	return builderDraftFromRow(row), nil
}

func (s *Service) SaveBuilderDraft(
	ctx context.Context,
	userID uuid.UUID,
	input SaveBuilderDraftInput,
) (BuilderDraft, error) {
	quantities, err := validateBuilderDraftInput(userID, input)
	if err != nil {
		return BuilderDraft{}, err
	}
	params := builderDraftWriteParams(input, quantities)
	if input.ExpectedVersion == 0 {
		row, err := s.queries.CreateBuilderDraft(ctx, CreateBuilderDraftParams{
			UserID: userID, BlueprintVersion: params.BlueprintVersion,
			Position1Quantity:  params.Position1Quantity,
			Position2Quantity:  params.Position2Quantity,
			Position3Quantity:  params.Position3Quantity,
			Position4Quantity:  params.Position4Quantity,
			Position5Quantity:  params.Position5Quantity,
			Position6Quantity:  params.Position6Quantity,
			Position7Quantity:  params.Position7Quantity,
			Position8Quantity:  params.Position8Quantity,
			Position9Quantity:  params.Position9Quantity,
			Position10Quantity: params.Position10Quantity,
			Difficulty:         params.Difficulty, OnlyNew: params.OnlyNew,
			Shuffle: params.Shuffle, PrioritizeMistakes: params.PrioritizeMistakes,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			return BuilderDraft{}, ErrConflict
		}
		if err != nil {
			return BuilderDraft{}, err
		}
		return builderDraftFromRow(row), nil
	}

	row, err := s.queries.UpdateBuilderDraft(ctx, UpdateBuilderDraftParams{
		UserID: userID, ExpectedVersion: input.ExpectedVersion,
		BlueprintVersion:   params.BlueprintVersion,
		Position1Quantity:  params.Position1Quantity,
		Position2Quantity:  params.Position2Quantity,
		Position3Quantity:  params.Position3Quantity,
		Position4Quantity:  params.Position4Quantity,
		Position5Quantity:  params.Position5Quantity,
		Position6Quantity:  params.Position6Quantity,
		Position7Quantity:  params.Position7Quantity,
		Position8Quantity:  params.Position8Quantity,
		Position9Quantity:  params.Position9Quantity,
		Position10Quantity: params.Position10Quantity,
		Difficulty:         params.Difficulty, OnlyNew: params.OnlyNew,
		Shuffle: params.Shuffle, PrioritizeMistakes: params.PrioritizeMistakes,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return BuilderDraft{}, ErrConflict
	}
	if err != nil {
		return BuilderDraft{}, err
	}
	return builderDraftFromRow(row), nil
}

type builderDraftParams struct {
	BlueprintVersion   string
	Position1Quantity  int16
	Position2Quantity  int16
	Position3Quantity  int16
	Position4Quantity  int16
	Position5Quantity  int16
	Position6Quantity  int16
	Position7Quantity  int16
	Position8Quantity  int16
	Position9Quantity  int16
	Position10Quantity int16
	Difficulty         string
	OnlyNew            bool
	Shuffle            bool
	PrioritizeMistakes bool
}

func builderDraftWriteParams(
	input SaveBuilderDraftInput,
	quantities [10]int16,
) builderDraftParams {
	return builderDraftParams{
		BlueprintVersion:  input.BlueprintVersion,
		Position1Quantity: quantities[0], Position2Quantity: quantities[1],
		Position3Quantity: quantities[2], Position4Quantity: quantities[3],
		Position5Quantity: quantities[4], Position6Quantity: quantities[5],
		Position7Quantity: quantities[6], Position8Quantity: quantities[7],
		Position9Quantity: quantities[8], Position10Quantity: quantities[9],
		Difficulty: string(input.Difficulty), OnlyNew: input.OnlyNew,
		Shuffle: input.Shuffle, PrioritizeMistakes: input.PrioritizeMistakes,
	}
}

func validateBuilderDraftInput(
	userID uuid.UUID,
	input SaveBuilderDraftInput,
) ([10]int16, error) {
	var quantities [10]int16
	if userID == uuid.Nil || input.ExpectedVersion < 0 ||
		len(input.BlueprintVersion) > 16 ||
		!blueprintVersionPattern.MatchString(input.BlueprintVersion) ||
		!validDifficulty(input.Difficulty) || len(input.Quantities) > 10 {
		return quantities, invalidInput("draft")
	}
	var total int32
	for _, quantity := range input.Quantities {
		if quantity.ExamPosition < 1 || quantity.ExamPosition > 10 ||
			quantity.Quantity < 1 || quantity.Quantity > MaxBuilderTasks ||
			quantities[quantity.ExamPosition-1] != 0 {
			return quantities, invalidInput("quantities")
		}
		total += quantity.Quantity
		if total > MaxBuilderTasks {
			return quantities, invalidInput("quantities")
		}
		quantities[quantity.ExamPosition-1] = int16(quantity.Quantity)
	}
	return quantities, nil
}

func validDifficulty(difficulty Difficulty) bool {
	return difficulty == DifficultyFoundation || difficulty == DifficultyBalanced ||
		difficulty == DifficultyAdvanced
}

func builderDraftFromRow(row TrainingBuilderDraft) BuilderDraft {
	values := [...]int16{
		row.Position1Quantity, row.Position2Quantity, row.Position3Quantity,
		row.Position4Quantity, row.Position5Quantity, row.Position6Quantity,
		row.Position7Quantity, row.Position8Quantity, row.Position9Quantity,
		row.Position10Quantity,
	}
	quantities := make([]PositionQuantity, 0, len(values))
	for index, quantity := range values {
		if quantity > 0 {
			quantities = append(quantities, PositionQuantity{
				ExamPosition: int32(index + 1), Quantity: int32(quantity),
			})
		}
	}
	return BuilderDraft{
		BlueprintVersion: row.BlueprintVersion, Quantities: quantities,
		Difficulty: Difficulty(row.Difficulty), OnlyNew: row.OnlyNew,
		Shuffle: row.Shuffle, PrioritizeMistakes: row.PrioritizeMistakes,
		Version: row.Version, UpdatedAt: row.UpdatedAt,
	}
}

func invalidInput(field string) error {
	return fmt.Errorf("%w: %s", ErrInvalidInput, field)
}
