package graph

import (
	"fmt"

	"github.com/google/uuid"

	"github.com/do-indeksa/platform/apps/api/internal/graph/model"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/training"
)

func trainingSaveBuilderDraftInput(
	input model.SaveTrainingBuilderDraftInput,
) (training.SaveBuilderDraftInput, error) {
	quantities := make([]training.PositionQuantity, len(input.Quantities))
	for index, quantity := range input.Quantities {
		quantities[index] = training.PositionQuantity{
			ExamPosition: quantity.ExamPosition,
			Quantity:     quantity.Quantity,
		}
	}
	difficulty, err := trainingDifficulty(input.Difficulty)
	if err != nil {
		return training.SaveBuilderDraftInput{}, err
	}
	return training.SaveBuilderDraftInput{
		ExpectedVersion:    input.ExpectedVersion,
		BlueprintVersion:   input.BlueprintVersion,
		Quantities:         quantities,
		Difficulty:         difficulty,
		OnlyNew:            input.OnlyNew,
		Shuffle:            input.Shuffle,
		PrioritizeMistakes: input.PrioritizeMistakes,
	}, nil
}

func trainingDifficulty(
	difficulty model.TrainingBuilderDifficulty,
) (training.Difficulty, error) {
	switch difficulty {
	case model.TrainingBuilderDifficultyFoundation:
		return training.DifficultyFoundation, nil
	case model.TrainingBuilderDifficultyBalanced:
		return training.DifficultyBalanced, nil
	case model.TrainingBuilderDifficultyAdvanced:
		return training.DifficultyAdvanced, nil
	default:
		return "", fmt.Errorf("%w: difficulty", training.ErrInvalidInput)
	}
}

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
		answerPartCount, err := optionalInputInt16(item.AnswerPartCount, "items.answerPartCount")
		if err != nil {
			return progress.StartRunInput{}, err
		}
		items[i] = progress.NewRunItem{
			ID:              itemID,
			TaskID:          item.TaskID,
			ExamPosition:    examPosition,
			Topic:           item.Topic,
			MaxPoints:       maxPoints,
			AnswerPartCount: answerPartCount,
			TaskRevision:    item.TaskRevision,
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

func progressCheckpointRunInput(input model.CheckpointRunInput) (progress.CheckpointRunInput, error) {
	id, err := inputID(input.ID, "id")
	if err != nil {
		return progress.CheckpointRunInput{}, err
	}
	currentOrdinal, err := inputInt16(input.CurrentOrdinal, "currentOrdinal")
	if err != nil {
		return progress.CheckpointRunInput{}, err
	}
	drafts := make([]progress.RunCheckpointDraftInput, len(input.Drafts))
	for index, draft := range input.Drafts {
		runItemID, err := inputID(draft.RunItemID, "drafts.runItemId")
		if err != nil {
			return progress.CheckpointRunInput{}, err
		}
		drafts[index] = progress.RunCheckpointDraftInput{
			RunItemID: runItemID,
			Answer:    draft.Answer,
		}
	}
	return progress.CheckpointRunInput{
		ID:               id,
		ExpectedVersion:  input.ExpectedVersion,
		CurrentOrdinal:   currentOrdinal,
		ActiveDurationMs: input.ActiveDurationMs,
		Drafts:           drafts,
	}, nil
}

func progressAbandonRunInput(input model.AbandonRunInput) (progress.AbandonRunInput, error) {
	id, err := inputID(input.ID, "id")
	if err != nil {
		return progress.AbandonRunInput{}, err
	}
	return progress.AbandonRunInput{ID: id}, nil
}

func progressSavePrepPreferencesInput(
	input model.SavePrepPreferencesInput,
) (progress.SavePrepPreferencesInput, error) {
	goalPoints, err := inputInt16(input.GoalPoints, "goalPoints")
	if err != nil {
		return progress.SavePrepPreferencesInput{}, err
	}
	return progress.SavePrepPreferencesInput{
		ExpectedVersion: input.ExpectedVersion,
		GoalPoints:      goalPoints,
		ExamDate:        input.ExamDate,
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
