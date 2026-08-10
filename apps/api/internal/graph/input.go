package graph

import (
	"fmt"

	"github.com/google/uuid"

	"github.com/do-indeksa/platform/apps/api/internal/graph/model"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

const (
	minInt16 = -1 << 15
	maxInt16 = 1<<15 - 1
)

func progressStartRunInput(input model.StartRunInput) (progress.StartRunInput, error) {
	id, err := inputID(input.ID, "id")
	if err != nil {
		return progress.StartRunInput{}, err
	}
	kind, err := progressRunKind(input.Kind)
	if err != nil {
		return progress.StartRunInput{}, err
	}
	items := make([]progress.NewRunItem, len(input.Items))
	for i, item := range input.Items {
		itemID, err := inputID(item.ID, "items.id")
		if err != nil {
			return progress.StartRunInput{}, err
		}
		examPosition, err := inputInt16(item.ExamPosition, "items.examPosition")
		if err != nil {
			return progress.StartRunInput{}, err
		}
		maxPoints, err := optionalInputInt16(item.MaxPoints, "items.maxPoints")
		if err != nil {
			return progress.StartRunInput{}, err
		}
		items[i] = progress.NewRunItem{
			ID:           itemID,
			TaskID:       item.TaskID,
			ExamPosition: examPosition,
			Topic:        item.Topic,
			MaxPoints:    maxPoints,
			TaskRevision: item.TaskRevision,
		}
	}
	return progress.StartRunInput{
		ID:               id,
		Kind:             kind,
		BlueprintVersion: input.BlueprintVersion,
		ContentRevision:  input.ContentRevision,
		StartedAt:        input.StartedAt,
		DeadlineAt:       input.DeadlineAt,
		Items:            items,
	}, nil
}

func progressRecordAttemptInput(input model.RecordAttemptInput) (progress.RecordAttemptInput, error) {
	id, err := inputID(input.ID, "id")
	if err != nil {
		return progress.RecordAttemptInput{}, err
	}
	var runItemID *uuid.UUID
	if input.RunItemID != nil {
		parsed, err := inputID(*input.RunItemID, "runItemId")
		if err != nil {
			return progress.RecordAttemptInput{}, err
		}
		runItemID = &parsed
	}
	var standalone *progress.StandaloneAttemptTarget
	if input.Standalone != nil {
		examPosition, err := inputInt16(input.Standalone.ExamPosition, "standalone.examPosition")
		if err != nil {
			return progress.RecordAttemptInput{}, err
		}
		maxPoints, err := optionalInputInt16(input.Standalone.MaxPoints, "standalone.maxPoints")
		if err != nil {
			return progress.RecordAttemptInput{}, err
		}
		standalone = &progress.StandaloneAttemptTarget{
			TaskID:       input.Standalone.TaskID,
			ExamPosition: examPosition,
			TaskRevision: input.Standalone.TaskRevision,
			MaxPoints:    maxPoints,
		}
	}
	outcome, err := progressAttemptOutcome(input.Outcome)
	if err != nil {
		return progress.RecordAttemptInput{}, err
	}
	gradingKind, err := progressGradingKind(input.GradingKind)
	if err != nil {
		return progress.RecordAttemptInput{}, err
	}
	helpLevel, err := inputInt16(input.HelpLevel, "helpLevel")
	if err != nil {
		return progress.RecordAttemptInput{}, err
	}
	earnedPoints, err := optionalInputInt16(input.EarnedPoints, "earnedPoints")
	if err != nil {
		return progress.RecordAttemptInput{}, err
	}
	return progress.RecordAttemptInput{
		ID:               id,
		RunItemID:        runItemID,
		Standalone:       standalone,
		StartedAt:        input.StartedAt,
		SubmittedAt:      input.SubmittedAt,
		ActiveDurationMs: input.ActiveDurationMs,
		Answer:           input.Answer,
		Outcome:          outcome,
		HelpLevel:        helpLevel,
		GradingKind:      gradingKind,
		EarnedPoints:     earnedPoints,
	}, nil
}

func progressSubmitRunInput(input model.SubmitRunInput) (progress.SubmitRunInput, error) {
	id, err := inputID(input.ID, "id")
	if err != nil {
		return progress.SubmitRunInput{}, err
	}
	return progress.SubmitRunInput{
		ID:               id,
		SubmittedAt:      input.SubmittedAt,
		ActiveDurationMs: input.ActiveDurationMs,
	}, nil
}

func progressRunKind(kind model.RunKind) (progress.RunKind, error) {
	switch kind {
	case model.RunKindPractice:
		return progress.RunKindPractice, nil
	case model.RunKindDiagnostic:
		return progress.RunKindDiagnostic, nil
	case model.RunKindSimulation:
		return progress.RunKindSimulation, nil
	default:
		return "", invalidGraphInput("kind")
	}
}

func progressAttemptOutcome(outcome model.AttemptOutcome) (progress.AttemptOutcome, error) {
	switch outcome {
	case model.AttemptOutcomeCorrect:
		return progress.AttemptOutcomeCorrect, nil
	case model.AttemptOutcomeIncorrect:
		return progress.AttemptOutcomeIncorrect, nil
	case model.AttemptOutcomePartial:
		return progress.AttemptOutcomePartial, nil
	case model.AttemptOutcomeSkipped:
		return progress.AttemptOutcomeSkipped, nil
	case model.AttemptOutcomeUngraded:
		return progress.AttemptOutcomeUngraded, nil
	default:
		return "", invalidGraphInput("outcome")
	}
}

func progressGradingKind(kind model.ClientGradingKind) (progress.GradingKind, error) {
	switch kind {
	case model.ClientGradingKindAuto:
		return progress.GradingKindAuto, nil
	case model.ClientGradingKindRubricSelf:
		return progress.GradingKindRubricSelf, nil
	default:
		return "", invalidGraphInput("gradingKind")
	}
}

func inputID(value, field string) (uuid.UUID, error) {
	id, err := uuid.Parse(value)
	if err != nil {
		return uuid.Nil, invalidGraphInput(field)
	}
	return id, nil
}

func inputInt16(value int32, field string) (int16, error) {
	if value < minInt16 || value > maxInt16 {
		return 0, invalidGraphInput(field)
	}
	return int16(value), nil
}

func optionalInputInt16(value *int32, field string) (*int16, error) {
	if value == nil {
		return nil, nil
	}
	converted, err := inputInt16(*value, field)
	if err != nil {
		return nil, err
	}
	return &converted, nil
}

func invalidGraphInput(field string) error {
	return fmt.Errorf("%w: %s", progress.ErrInvalidInput, field)
}
