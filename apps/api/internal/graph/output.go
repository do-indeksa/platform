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
		Items:            items,
	}, nil
}

func graphRunSummary(run progress.Run) (model.RunSummary, error) {
	kind, err := graphRunKind(run.Kind)
	if err != nil {
		return model.RunSummary{}, err
	}
	status, err := graphRunStatus(run.Status)
	if err != nil {
		return model.RunSummary{}, err
	}
	return model.RunSummary{
		ID:               run.ID.String(),
		Kind:             kind,
		Status:           status,
		BlueprintVersion: run.BlueprintVersion,
		ContentRevision:  run.ContentRevision,
		StartedAt:        run.StartedAt,
		DeadlineAt:       graphTime(run.DeadlineAt),
		SubmittedAt:      graphTime(run.SubmittedAt),
		ActiveDurationMs: run.DurationMs,
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
	if taskRevision == nil {
		return model.Attempt{}, fmt.Errorf("attempt %s has no task revision", attempt.PublicID)
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
		TaskRevision:     *taskRevision,
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
