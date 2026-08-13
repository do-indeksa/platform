package training

import (
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestValidateBuilderDraftInput(t *testing.T) {
	userID := uuid.New()
	valid := SaveBuilderDraftInput{
		ExpectedVersion:  0,
		BlueprintVersion: "2026.1",
		Quantities: []PositionQuantity{
			{ExamPosition: 10, Quantity: 1},
			{ExamPosition: 1, Quantity: 3},
			{ExamPosition: 4, Quantity: 2},
		},
		Difficulty:         DifficultyBalanced,
		OnlyNew:            true,
		Shuffle:            true,
		PrioritizeMistakes: false,
	}
	quantities, err := validateBuilderDraftInput(userID, valid)
	if err != nil {
		t.Fatalf("valid input rejected: %v", err)
	}
	if quantities[0] != 3 || quantities[3] != 2 || quantities[9] != 1 {
		t.Fatalf("quantities = %v", quantities)
	}

	empty := valid
	empty.Quantities = nil
	if _, err := validateBuilderDraftInput(userID, empty); err != nil {
		t.Fatalf("empty composition rejected: %v", err)
	}

	tests := []struct {
		name  string
		user  uuid.UUID
		input SaveBuilderDraftInput
	}{
		{name: "missing owner", user: uuid.Nil, input: valid},
		{name: "negative version", user: userID, input: withVersion(valid, -1)},
		{name: "invalid blueprint", user: userID, input: withBlueprint(valid, "ftn-p1:2026.1")},
		{name: "empty blueprint", user: userID, input: withBlueprint(valid, "")},
		{name: "invalid difficulty", user: userID, input: withDifficulty(valid, "expert")},
		{name: "zero position", user: userID, input: withQuantities(valid, PositionQuantity{ExamPosition: 0, Quantity: 1})},
		{name: "position above range", user: userID, input: withQuantities(valid, PositionQuantity{ExamPosition: 11, Quantity: 1})},
		{name: "zero quantity", user: userID, input: withQuantities(valid, PositionQuantity{ExamPosition: 1, Quantity: 0})},
		{name: "quantity above range", user: userID, input: withQuantities(valid, PositionQuantity{ExamPosition: 1, Quantity: 11})},
		{name: "duplicate position", user: userID, input: withQuantities(valid,
			PositionQuantity{ExamPosition: 1, Quantity: 1},
			PositionQuantity{ExamPosition: 1, Quantity: 2})},
		{name: "total above range", user: userID, input: withQuantities(valid,
			PositionQuantity{ExamPosition: 1, Quantity: 6},
			PositionQuantity{ExamPosition: 2, Quantity: 5})},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := validateBuilderDraftInput(test.user, test.input); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("validateBuilderDraftInput() error = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func TestBuilderDraftFromRowOrdersNonZeroQuantities(t *testing.T) {
	row := TrainingBuilderDraft{
		BlueprintVersion:   "2026.1",
		Position1Quantity:  3,
		Position4Quantity:  2,
		Position10Quantity: 1,
		Difficulty:         string(DifficultyAdvanced),
		Version:            7,
	}
	draft := builderDraftFromRow(row)
	if len(draft.Quantities) != 3 ||
		draft.Quantities[0] != (PositionQuantity{ExamPosition: 1, Quantity: 3}) ||
		draft.Quantities[1] != (PositionQuantity{ExamPosition: 4, Quantity: 2}) ||
		draft.Quantities[2] != (PositionQuantity{ExamPosition: 10, Quantity: 1}) {
		t.Fatalf("quantities = %+v", draft.Quantities)
	}
}

func withVersion(input SaveBuilderDraftInput, version int64) SaveBuilderDraftInput {
	input.ExpectedVersion = version
	return input
}

func withBlueprint(input SaveBuilderDraftInput, version string) SaveBuilderDraftInput {
	input.BlueprintVersion = version
	return input
}

func withDifficulty(input SaveBuilderDraftInput, difficulty Difficulty) SaveBuilderDraftInput {
	input.Difficulty = difficulty
	return input
}

func withQuantities(
	input SaveBuilderDraftInput,
	quantities ...PositionQuantity,
) SaveBuilderDraftInput {
	input.Quantities = quantities
	return input
}
