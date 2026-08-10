package progress

import (
	"time"

	"github.com/google/uuid"
)

const clientClockSkew = 5 * time.Minute

func normalizeStartRun(input StartRunInput, now time.Time) (StartRunInput, error) {
	if input.ID == uuid.Nil {
		return StartRunInput{}, invalidInput("id")
	}
	if !validRunKind(input.Kind) {
		return StartRunInput{}, invalidInput("kind")
	}
	if input.BlueprintVersion == "" || len(input.BlueprintVersion) > maxBlueprintSize {
		return StartRunInput{}, invalidInput("blueprintVersion")
	}
	if !validRevision(input.ContentRevision) {
		return StartRunInput{}, invalidInput("contentRevision")
	}
	startedAt, err := normalizeClientTime(input.StartedAt, now, "startedAt")
	if err != nil {
		return StartRunInput{}, err
	}
	input.StartedAt = startedAt
	if input.DeadlineAt != nil {
		deadline := input.DeadlineAt.UTC().Truncate(time.Microsecond)
		if deadline.Before(startedAt) {
			return StartRunInput{}, invalidInput("deadlineAt")
		}
		input.DeadlineAt = &deadline
	}
	if len(input.Items) == 0 || len(input.Items) > maxRunItems {
		return StartRunInput{}, invalidInput("items")
	}
	ids := make(map[uuid.UUID]struct{}, len(input.Items))
	taskIDs := make(map[string]struct{}, len(input.Items))
	positions := make(map[int16]struct{}, len(input.Items))
	var totalPoints int16
	for _, item := range input.Items {
		if item.ID == uuid.Nil || !validTaskID(item.TaskID) || !validTaskID(item.Topic) ||
			item.ExamPosition < 1 || item.ExamPosition > 10 || !validRevision(item.TaskRevision) {
			return StartRunInput{}, invalidInput("items")
		}
		if item.MaxPoints != nil {
			if *item.MaxPoints < 0 || *item.MaxPoints > 60 {
				return StartRunInput{}, invalidInput("items.maxPoints")
			}
			totalPoints += *item.MaxPoints
		}
		if _, duplicate := ids[item.ID]; duplicate {
			return StartRunInput{}, invalidInput("items.id")
		}
		if _, duplicate := taskIDs[item.TaskID]; duplicate {
			return StartRunInput{}, invalidInput("items.taskId")
		}
		ids[item.ID] = struct{}{}
		taskIDs[item.TaskID] = struct{}{}
		if input.Kind == RunKindSimulation {
			if item.MaxPoints == nil {
				return StartRunInput{}, invalidInput("items.maxPoints")
			}
			if _, duplicate := positions[item.ExamPosition]; duplicate {
				return StartRunInput{}, invalidInput("items.examPosition")
			}
			positions[item.ExamPosition] = struct{}{}
		}
	}
	if input.Kind == RunKindSimulation && totalPoints > 60 {
		return StartRunInput{}, invalidInput("items.maxPoints")
	}
	return input, nil
}

func normalizeClientTime(value, now time.Time, field string) (time.Time, error) {
	if value.IsZero() || value.After(now.Add(clientClockSkew)) {
		return time.Time{}, invalidInput(field)
	}
	return value.UTC().Truncate(time.Microsecond), nil
}
