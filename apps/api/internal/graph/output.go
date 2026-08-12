package graph

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/do-indeksa/platform/apps/api/internal/graph/model"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

func graphRun(aggregate progress.RunAggregate) (*model.Run, error) {
	kind, err := graphRunKind(aggregate.Run.Kind)
	if err != nil {
		return nil, err
	}
	status, err := graphRunStatus(aggregate.Run.Status)
	if err != nil {
		return nil, err
	}
	attemptsByItem := make(map[uuid.UUID][]progress.Attempt, len(aggregate.Items))
	for _, attempt := range aggregate.Attempts {
		if !attempt.RunItemID.Valid {
			return nil, fmt.Errorf("run attempt %s has no run item", attempt.PublicID)
		}
		itemID := uuid.UUID(attempt.RunItemID.Bytes)
		attemptsByItem[itemID] = append(attemptsByItem[itemID], attempt)
	}
	items := make([]model.RunItem, len(aggregate.Items))
	for i, item := range aggregate.Items {
		attempts := attemptsByItem[item.ID]
		mappedAttempts := make([]model.Attempt, len(attempts))
		for j, attempt := range attempts {
			mapped, err := graphAttempt(attempt, &item)
			if err != nil {
				return nil, err
			}
			mappedAttempts[j] = mapped
		}
		items[i] = model.RunItem{
			ID:             item.ID.String(),
			TaskID:         item.TaskID,
			Ordinal:        int32(item.Ordinal),
			ExamPosition:   int32(item.ExamPosition),
			Topic:          item.Topic,
			MaxPoints:      graphInt16(item.MaxPoints),
			TaskRevision:   item.TaskRevision,
			RecentAttempts: mappedAttempts,
		}
	}
	return &model.Run{
		ID:               aggregate.Run.ID.String(),
		Kind:             kind,
		Status:           status,
		BlueprintVersion: aggregate.Run.BlueprintVersion,
		ContentRevision:  aggregate.Run.ContentRevision,
		StartedAt:        aggregate.Run.StartedAt,
		DeadlineAt:       graphTime(aggregate.Run.DeadlineAt),
		SubmittedAt:      graphTime(aggregate.Run.SubmittedAt),
		ActiveDurationMs: aggregate.Run.DurationMs,
		Checkpoint:       graphRunCheckpoint(aggregate.Checkpoint),
		Items:            items,
	}, nil
}

func graphRunCheckpoint(
	aggregate *progress.RunCheckpointAggregate,
) *model.RunCheckpoint {
	if aggregate == nil {
		return nil
	}
	drafts := make([]model.RunCheckpointDraft, len(aggregate.Drafts))
	for index, draft := range aggregate.Drafts {
		drafts[index] = model.RunCheckpointDraft{
			RunItemID: draft.RunItemID.String(),
			Answer:    draft.Answer,
		}
	}
	return &model.RunCheckpoint{
		Version:          aggregate.Checkpoint.Version,
		CurrentOrdinal:   int32(aggregate.Checkpoint.CurrentOrdinal),
		ActiveDurationMs: aggregate.Checkpoint.ActiveDurationMs,
		UpdatedAt:        aggregate.Checkpoint.UpdatedAt,
		Drafts:           drafts,
	}
}

func graphRunSummary(aggregate progress.RunAggregate) (model.RunSummary, error) {
	run := aggregate.Run
	kind, err := graphRunKind(run.Kind)
	if err != nil {
		return model.RunSummary{}, err
	}
	status, err := graphRunStatus(run.Status)
	if err != nil {
		return model.RunSummary{}, err
	}
	completedItemCount := int32(len(aggregate.Attempts))
	correctItemCount := int32(0)
	earnedPoints := int32(0)
	maxPoints := int32(0)
	taskIDs := make([]string, len(aggregate.Items))
	hasCompleteEarnedPoints := len(aggregate.Attempts) == len(aggregate.Items)
	hasCompleteMaxPoints := len(aggregate.Items) > 0
	for _, attempt := range aggregate.Attempts {
		if attempt.Outcome != nil && *attempt.Outcome == string(progress.AttemptOutcomeCorrect) {
			correctItemCount++
		}
		if attempt.EarnedPoints == nil {
			hasCompleteEarnedPoints = false
		} else {
			earnedPoints += int32(*attempt.EarnedPoints)
		}
	}
	for index, item := range aggregate.Items {
		taskIDs[index] = item.TaskID
		if item.MaxPoints == nil {
			hasCompleteMaxPoints = false
		} else {
			maxPoints += int32(*item.MaxPoints)
		}
	}

	result := model.RunSummary{
		ID:                 run.ID.String(),
		Kind:               kind,
		Status:             status,
		BlueprintVersion:   run.BlueprintVersion,
		ContentRevision:    run.ContentRevision,
		StartedAt:          run.StartedAt,
		DeadlineAt:         graphTime(run.DeadlineAt),
		SubmittedAt:        graphTime(run.SubmittedAt),
		ActiveDurationMs:   run.DurationMs,
		TaskIds:            taskIDs,
		ItemCount:          int32(len(aggregate.Items)),
		CompletedItemCount: completedItemCount,
		CorrectItemCount:   correctItemCount,
	}
	if hasCompleteEarnedPoints {
		result.EarnedPoints = &earnedPoints
	}
	if hasCompleteMaxPoints {
		result.MaxPoints = &maxPoints
	}
	return result, nil
}

func graphCompletedSimulationRun(
	aggregate progress.RunAggregate,
) (model.CompletedSimulationRun, error) {
	if progress.RunKind(aggregate.Run.Kind) != progress.RunKindSimulation ||
		progress.RunStatus(aggregate.Run.Status) != progress.RunStatusSubmitted {
		return model.CompletedSimulationRun{}, fmt.Errorf(
			"run %s is not a completed simulation",
			aggregate.Run.ID,
		)
	}
	if !aggregate.Run.SubmittedAt.Valid {
		return model.CompletedSimulationRun{}, fmt.Errorf(
			"completed simulation %s has no submission time",
			aggregate.Run.ID,
		)
	}

	attemptsByItem := make(map[uuid.UUID]progress.Attempt, len(aggregate.Attempts))
	for _, attempt := range aggregate.Attempts {
		if !attempt.RunItemID.Valid {
			return model.CompletedSimulationRun{}, fmt.Errorf(
				"run attempt %s has no run item",
				attempt.PublicID,
			)
		}
		itemID := uuid.UUID(attempt.RunItemID.Bytes)
		if _, duplicate := attemptsByItem[itemID]; duplicate {
			return model.CompletedSimulationRun{}, fmt.Errorf(
				"completed simulation item %s has multiple latest attempts",
				itemID,
			)
		}
		attemptsByItem[itemID] = attempt
	}

	items := make([]model.CompletedSimulationRunItem, len(aggregate.Items))
	for index, item := range aggregate.Items {
		mapped := model.CompletedSimulationRunItem{
			TaskID:       item.TaskID,
			ExamPosition: int32(item.ExamPosition),
			Topic:        item.Topic,
			MaxPoints:    graphInt16(item.MaxPoints),
			TaskRevision: item.TaskRevision,
		}
		if attempt, ok := attemptsByItem[item.ID]; ok {
			if progress.RunKind(attempt.Source) != progress.RunKindSimulation {
				return model.CompletedSimulationRun{}, fmt.Errorf(
					"completed simulation attempt %s has mode %q",
					attempt.PublicID,
					attempt.Source,
				)
			}
			outcome, err := graphAttemptOutcome(attempt)
			if err != nil {
				return model.CompletedSimulationRun{}, err
			}
			gradingKind, err := graphGradingKind(attempt.GradingKind)
			if err != nil {
				return model.CompletedSimulationRun{}, err
			}
			mapped.Answer = attempt.Answer
			mapped.Outcome = &outcome
			mapped.GradingKind = &gradingKind
			mapped.EarnedPoints = graphInt16(attempt.EarnedPoints)
		}
		items[index] = mapped
	}

	return model.CompletedSimulationRun{
		ID:               aggregate.Run.ID.String(),
		BlueprintVersion: aggregate.Run.BlueprintVersion,
		ContentRevision:  aggregate.Run.ContentRevision,
		StartedAt:        aggregate.Run.StartedAt,
		DeadlineAt:       graphTime(aggregate.Run.DeadlineAt),
		SubmittedAt:      aggregate.Run.SubmittedAt.Time,
		ActiveDurationMs: aggregate.Run.DurationMs,
		Items:            items,
	}, nil
}

func graphAttempt(attempt progress.Attempt, item *progress.RunItem) (model.Attempt, error) {
	mode, err := graphRunKind(attempt.Source)
	if err != nil {
		return model.Attempt{}, err
	}
	outcome, err := graphAttemptOutcome(attempt)
	if err != nil {
		return model.Attempt{}, err
	}
	gradingKind, err := graphGradingKind(attempt.GradingKind)
	if err != nil {
		return model.Attempt{}, err
	}
	startedAt := attempt.CreatedAt
	if attempt.StartedAt.Valid {
		startedAt = attempt.StartedAt.Time
	}
	submittedAt := attempt.CreatedAt
	if attempt.SubmittedAt.Valid {
		submittedAt = attempt.SubmittedAt.Time
	}
	taskRevision := attempt.TaskRevision
	maxPoints := attempt.MaxPoints
	if item != nil {
		if taskRevision == nil {
			taskRevision = &item.TaskRevision
		}
		if maxPoints == nil {
			maxPoints = item.MaxPoints
		}
	}
	var runItemID *string
	if attempt.RunItemID.Valid {
		value := uuid.UUID(attempt.RunItemID.Bytes).String()
		runItemID = &value
	}
	return model.Attempt{
		ID:               attempt.PublicID.String(),
		RunItemID:        runItemID,
		TaskID:           attempt.TaskID,
		ExamPosition:     attempt.Slot,
		Mode:             mode,
		StartedAt:        startedAt,
		SubmittedAt:      submittedAt,
		ActiveDurationMs: attempt.ActiveDurationMs,
		Answer:           attempt.Answer,
		Outcome:          outcome,
		HelpLevel:        int32(attempt.HelpLevel),
		GradingKind:      gradingKind,
		EarnedPoints:     graphInt16(attempt.EarnedPoints),
		MaxPoints:        graphInt16(maxPoints),
		TaskRevision:     taskRevision,
	}, nil
}

func graphRunKind(kind string) (model.RunKind, error) {
	switch progress.RunKind(kind) {
	case progress.RunKindPractice:
		return model.RunKindPractice, nil
	case progress.RunKindDiagnostic:
		return model.RunKindDiagnostic, nil
	case progress.RunKindSimulation:
		return model.RunKindSimulation, nil
	default:
		return "", fmt.Errorf("unknown stored run kind %q", kind)
	}
}

func graphRunStatus(status string) (model.RunStatus, error) {
	switch progress.RunStatus(status) {
	case progress.RunStatusActive:
		return model.RunStatusActive, nil
	case progress.RunStatusSubmitted:
		return model.RunStatusSubmitted, nil
	case progress.RunStatusAbandoned:
		return model.RunStatusAbandoned, nil
	default:
		return "", fmt.Errorf("unknown stored run status %q", status)
	}
}

func graphAttemptOutcome(attempt progress.Attempt) (model.AttemptOutcome, error) {
	if attempt.Outcome == nil {
		if attempt.Correct {
			return model.AttemptOutcomeCorrect, nil
		}
		return model.AttemptOutcomeIncorrect, nil
	}
	switch progress.AttemptOutcome(*attempt.Outcome) {
	case progress.AttemptOutcomeCorrect:
		return model.AttemptOutcomeCorrect, nil
	case progress.AttemptOutcomeIncorrect:
		return model.AttemptOutcomeIncorrect, nil
	case progress.AttemptOutcomePartial:
		return model.AttemptOutcomePartial, nil
	case progress.AttemptOutcomeSkipped:
		return model.AttemptOutcomeSkipped, nil
	case progress.AttemptOutcomeUngraded:
		return model.AttemptOutcomeUngraded, nil
	default:
		return "", fmt.Errorf("unknown stored attempt outcome %q", *attempt.Outcome)
	}
}

func graphGradingKind(kind *string) (model.GradingKind, error) {
	if kind == nil {
		return model.GradingKindAuto, nil
	}
	switch progress.GradingKind(*kind) {
	case progress.GradingKindAuto:
		return model.GradingKindAuto, nil
	case progress.GradingKindRubricSelf:
		return model.GradingKindRubricSelf, nil
	case progress.GradingKindAIAssisted:
		return model.GradingKindAiAssisted, nil
	case progress.GradingKindHuman:
		return model.GradingKindHuman, nil
	default:
		return "", fmt.Errorf("unknown stored grading kind %q", *kind)
	}
}

func graphTime(value pgtype.Timestamptz) *time.Time {
	if !value.Valid {
		return nil
	}
	return &value.Time
}

func graphInt16(value *int16) *int32 {
	if value == nil {
		return nil
	}
	converted := int32(*value)
	return &converted
}
