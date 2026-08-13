package prep

import (
	"errors"
	"testing"

	"github.com/google/uuid"
)

func TestValidateSaveInput(t *testing.T) {
	userID := uuid.New()
	valid := SaveInput{
		ExpectedVersion: 0,
		GoalPoints:      42,
		ExamDate:        "2028-02-29",
	}
	if err := validateSaveInput(userID, valid); err != nil {
		t.Fatalf("valid input rejected: %v", err)
	}

	tests := []struct {
		name  string
		user  uuid.UUID
		input SaveInput
	}{
		{name: "missing owner", user: uuid.Nil, input: valid},
		{name: "negative version", user: userID, input: withVersion(valid, -1)},
		{name: "goal below range", user: userID, input: withGoal(valid, 0)},
		{name: "goal above range", user: userID, input: withGoal(valid, 61)},
		{name: "non leap day", user: userID, input: withDate(valid, "2027-02-29")},
		{name: "non canonical date", user: userID, input: withDate(valid, "2028-2-09")},
		{name: "zero year", user: userID, input: withDate(valid, "0000-01-01")},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if err := validateSaveInput(test.user, test.input); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("validateSaveInput() error = %v, want ErrInvalidInput", err)
			}
		})
	}
}

func withVersion(input SaveInput, version int64) SaveInput {
	input.ExpectedVersion = version
	return input
}

func withGoal(input SaveInput, goal int32) SaveInput {
	input.GoalPoints = goal
	return input
}

func withDate(input SaveInput, date string) SaveInput {
	input.ExamDate = date
	return input
}
