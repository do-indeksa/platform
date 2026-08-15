package progress

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
)

func snapshottedPracticeRun(itemCount int) StartRunInput {
	runID := uuid.New()
	startedAt := time.Now().Add(-2 * time.Hour).UTC().Truncate(time.Microsecond)
	items := make([]NewRunItem, itemCount)
	for index := range items {
		taskID := fmt.Sprintf("task-%03d", index+1)
		count := int16(index%3 + 1)
		items[index] = NewRunItem{
			ID: runItemSnapshotID(runID, taskID), TaskID: taskID,
			ExamPosition: int16(index%10 + 1), Topic: fmt.Sprintf("topic-%d", index%10+1),
			AnswerPartCount: &count,
			TaskRevision:    "sha256:" + fmt.Sprintf("%064x", index+1),
		}
	}
	return StartRunInput{
		ID: runID, Kind: RunKindPractice,
		BlueprintVersion: "ftn-p1:2026.1",
		ContentRevision:  "sha256:" + fmt.Sprintf("%064x", itemCount+100),
		StartedAt:        startedAt, Items: items,
	}
}

func practiceAttempt(
	run StartRunInput,
	itemIndex, attemptNumber int,
	startedAt, submittedAt time.Time,
	outcome AttemptOutcome,
	helpLevel int16,
) RecordAttemptInput {
	answers := make([]string, int(*run.Items[itemIndex].AnswerPartCount))
	for index := range answers {
		answers[index] = fmt.Sprintf("answer-%d-%d", attemptNumber, index+1)
	}
	raw, err := json.Marshal(answers)
	if err != nil {
		panic(err)
	}
	answer := string(raw)
	return RecordAttemptInput{
		ID:        practiceAttemptID(run.Items[itemIndex].ID, attemptNumber),
		RunItemID: &run.Items[itemIndex].ID, StartedAt: startedAt, SubmittedAt: submittedAt,
		ActiveDurationMs: int64Pointer(submittedAt.Sub(startedAt).Milliseconds()),
		Answer:           &answer, Outcome: outcome, HelpLevel: helpLevel, GradingKind: GradingKindAuto,
	}
}

func practiceDraft(
	run StartRunInput,
	itemIndex, attemptNumber int,
	helpLevel int16,
) RunCheckpointDraftInput {
	answers := make([]string, int(*run.Items[itemIndex].AnswerPartCount))
	for index := range answers {
		answers[index] = fmt.Sprintf("answer-%d-%d", attemptNumber, index+1)
	}
	raw, err := json.Marshal(practiceCheckpointDraftPayload{
		Version: practiceDraftVersion, NextAttempt: attemptNumber,
		Answers: answers, HelpLevel: helpLevel,
	})
	if err != nil {
		panic(err)
	}
	return RunCheckpointDraftInput{RunItemID: run.Items[itemIndex].ID, Answer: string(raw)}
}

func startPracticeRun(
	t *testing.T,
	service *Service,
	userID uuid.UUID,
	itemCount int,
) StartRunInput {
	t.Helper()
	run := snapshottedPracticeRun(itemCount)
	if _, err := service.StartRun(context.Background(), userID, run); err != nil {
		t.Fatal(err)
	}
	return run
}

func int64Pointer(value int64) *int64 { return &value }
