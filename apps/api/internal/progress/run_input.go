package progress

import (
	"regexp"
	"time"

	"github.com/google/uuid"
)

const (
	clientClockSkew         = 5 * time.Minute
	p1SimulationDuration    = 4 * time.Hour
	p1SimulationTotalPoints = int16(60)
	maxPracticeTaskCount    = 30
	maxAnswerPartCount      = int16(6)
)

var (
	p1BlueprintPattern      = regexp.MustCompile(`^ftn-p1:[0-9]{4}[.][0-9]+$`)
	snapshotRevisionPattern = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)
)

func normalizeStartRun(input StartRunInput, now time.Time) (StartRunInput, error) {
	if input.ID == uuid.Nil {
		return StartRunInput{}, invalidInput("id")
	}
	if !validRunKind(input.Kind) {
		return StartRunInput{}, invalidInput("kind")
	}
	if !validMetadataText(input.BlueprintVersion, maxBlueprintSize) {
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
	if input.Kind == RunKindSimulation {
		if !p1BlueprintPattern.MatchString(input.BlueprintVersion) {
			return StartRunInput{}, invalidInput("blueprintVersion")
		}
		if !snapshotRevisionPattern.MatchString(input.ContentRevision) {
			return StartRunInput{}, invalidInput("contentRevision")
		}
		expectedDeadline := startedAt.Add(p1SimulationDuration)
		if input.DeadlineAt != nil && !input.DeadlineAt.Equal(expectedDeadline) {
			return StartRunInput{}, invalidInput("deadlineAt")
		}
		input.DeadlineAt = &expectedDeadline
		if len(input.Items) != P1TaskCount {
			return StartRunInput{}, invalidInput("items")
		}
	}
	if len(input.Items) == 0 || len(input.Items) > MaxRunItems {
		return StartRunInput{}, invalidInput("items")
	}
	snapshottedItems := 0
	for _, item := range input.Items {
		if item.AnswerPartCount != nil {
			snapshottedItems++
		}
	}
	if (input.Kind == RunKindSimulation || input.Kind == RunKindDiagnostic ||
		input.Kind == RunKindPractice) &&
		snapshottedItems != 0 && snapshottedItems != len(input.Items) {
		return StartRunInput{}, invalidInput("items.answerPartCount")
	}
	strictDiagnostic := input.Kind == RunKindDiagnostic && snapshottedItems > 0
	strictPractice := input.Kind == RunKindPractice && snapshottedItems > 0
	if strictDiagnostic {
		if len(input.Items) != P1TaskCount {
			return StartRunInput{}, invalidInput("items")
		}
		if !p1BlueprintPattern.MatchString(input.BlueprintVersion) {
			return StartRunInput{}, invalidInput("blueprintVersion")
		}
		if !snapshotRevisionPattern.MatchString(input.ContentRevision) {
			return StartRunInput{}, invalidInput("contentRevision")
		}
		if input.StartedAt.UnixMilli() <= 0 {
			return StartRunInput{}, invalidInput("startedAt")
		}
	}
	if strictPractice {
		if len(input.Items) > maxPracticeTaskCount {
			return StartRunInput{}, invalidInput("items")
		}
		if !p1BlueprintPattern.MatchString(input.BlueprintVersion) {
			return StartRunInput{}, invalidInput("blueprintVersion")
		}
		if !snapshotRevisionPattern.MatchString(input.ContentRevision) {
			return StartRunInput{}, invalidInput("contentRevision")
		}
		if input.DeadlineAt != nil {
			return StartRunInput{}, invalidInput("deadlineAt")
		}
		if input.StartedAt.UnixMilli() <= 0 {
			return StartRunInput{}, invalidInput("startedAt")
		}
	}
	ids := make(map[uuid.UUID]struct{}, len(input.Items))
	taskIDs := make(map[string]struct{}, len(input.Items))
	positions := make(map[int16]struct{}, len(input.Items))
	var totalPoints int16
	for index, item := range input.Items {
		if item.ID == uuid.Nil || !validTaskID(item.TaskID) || !validTaskID(item.Topic) ||
			item.ExamPosition < 1 || item.ExamPosition > 10 || !validRevision(item.TaskRevision) {
			return StartRunInput{}, invalidInput("items")
		}
		if item.MaxPoints != nil {
			if *item.MaxPoints < 1 || *item.MaxPoints > 60 {
				return StartRunInput{}, invalidInput("items.maxPoints")
			}
			totalPoints += *item.MaxPoints
		}
		if item.AnswerPartCount != nil {
			if *item.AnswerPartCount < 1 || *item.AnswerPartCount > maxAnswerPartCount {
				return StartRunInput{}, invalidInput("items.answerPartCount")
			}
		}
		if _, duplicate := ids[item.ID]; duplicate {
			return StartRunInput{}, invalidInput("items.id")
		}
		if _, duplicate := taskIDs[item.TaskID]; duplicate {
			return StartRunInput{}, invalidInput("items.taskId")
		}
		ids[item.ID] = struct{}{}
		taskIDs[item.TaskID] = struct{}{}
		if input.Kind == RunKindSimulation || strictDiagnostic || strictPractice {
			if !snapshotRevisionPattern.MatchString(item.TaskRevision) {
				return StartRunInput{}, invalidInput("items.taskRevision")
			}
			if input.Kind == RunKindSimulation && item.MaxPoints == nil {
				return StartRunInput{}, invalidInput("items.maxPoints")
			}
			if (input.Kind == RunKindDiagnostic || strictPractice) && item.MaxPoints != nil {
				return StartRunInput{}, invalidInput("items.maxPoints")
			}
			if item.AnswerPartCount != nil && item.ID != runItemSnapshotID(input.ID, item.TaskID) {
				return StartRunInput{}, invalidInput("items.id")
			}
			if input.Kind == RunKindSimulation || strictDiagnostic {
				if item.ExamPosition != int16(index+1) {
					return StartRunInput{}, invalidInput("items.examPosition")
				}
				if _, duplicate := positions[item.ExamPosition]; duplicate {
					return StartRunInput{}, invalidInput("items.examPosition")
				}
				positions[item.ExamPosition] = struct{}{}
			}
		}
	}
	if input.Kind == RunKindSimulation && totalPoints != p1SimulationTotalPoints {
		return StartRunInput{}, invalidInput("items.maxPoints")
	}
	return input, nil
}

func runItemSnapshotID(runID uuid.UUID, taskID string) uuid.UUID {
	return uuid.NewSHA1(runID, []byte("run-item:"+taskID))
}

func normalizeClientTime(value, now time.Time, field string) (time.Time, error) {
	if value.IsZero() || value.After(now.Add(clientClockSkew)) {
		return time.Time{}, invalidInput(field)
	}
	return value.UTC().Truncate(time.Microsecond), nil
}
