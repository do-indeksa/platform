package progress

import (
	"context"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func snapshottedDiagnosticRun() StartRunInput {
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	run := StartRunInput{
		ID:               uuid.New(),
		Kind:             RunKindDiagnostic,
		BlueprintVersion: "ftn-p1:2026.1",
		ContentRevision:  "sha256:" + strings.Repeat("a", 64),
		StartedAt:        startedAt,
		Items:            make([]NewRunItem, p1TaskCount),
	}
	for index := range run.Items {
		taskID := fmt.Sprintf("task-%d", index+1)
		count := int16(1)
		if index == 0 {
			count = 2
		}
		run.Items[index] = NewRunItem{
			ID:              runItemSnapshotID(run.ID, taskID),
			TaskID:          taskID,
			ExamPosition:    int16(index + 1),
			Topic:           fmt.Sprintf("topic-%d", index+1),
			AnswerPartCount: &count,
			TaskRevision:    "sha256:" + strings.Repeat(fmt.Sprintf("%x", index), 64),
		}
	}
	return run
}

func diagnosticAttempt(
	run StartRunInput,
	index int,
	startedAt, submittedAt time.Time,
) RecordAttemptInput {
	answer := `["42"]`
	if *run.Items[index].AnswerPartCount == 2 {
		answer = `["42",""]`
	}
	return RecordAttemptInput{
		ID:          progressAutoAttemptID(run.Items[index].ID),
		RunItemID:   &run.Items[index].ID,
		StartedAt:   startedAt,
		SubmittedAt: submittedAt,
		Answer:      &answer,
		Outcome:     AttemptOutcomeCorrect,
		GradingKind: GradingKindAuto,
	}
}

func recordDiagnosticPrefix(
	ctx context.Context,
	t *testing.T,
	service *Service,
	userID uuid.UUID,
	run StartRunInput,
	count int,
) time.Time {
	t.Helper()
	previousSubmittedAt := run.StartedAt
	for index := 0; index < count; index++ {
		submittedAt := previousSubmittedAt.Add(time.Minute)
		attempt := diagnosticAttempt(run, index, previousSubmittedAt, submittedAt)
		if index%3 == 2 {
			attempt.Outcome = AttemptOutcomeSkipped
			attempt.Answer = nil
		}
		if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
			t.Fatalf("item %d: %v", index, err)
		}
		previousSubmittedAt = submittedAt
	}
	return previousSubmittedAt
}

func insertDiagnosticAttemptDirectly(
	t *testing.T,
	userID uuid.UUID,
	run StartRunInput,
	index int,
	attempt RecordAttemptInput,
) {
	t.Helper()
	outcome := string(attempt.Outcome)
	gradingKind := string(attempt.GradingKind)
	taskRevision := run.Items[index].TaskRevision
	if _, err := testPool.Exec(context.Background(), `
		insert into attempts (
			public_id, user_id, run_item_id, task_id, slot, correct, source,
			help_level, created_at, started_at, submitted_at, active_duration_ms,
			answer, outcome, grading_kind, earned_points, max_points, task_revision
		) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
	`,
		attempt.ID, userID, run.Items[index].ID, run.Items[index].TaskID,
		run.Items[index].ExamPosition, attempt.Outcome == AttemptOutcomeCorrect,
		RunKindDiagnostic, attempt.HelpLevel, attempt.SubmittedAt, attempt.StartedAt,
		attempt.SubmittedAt, attempt.ActiveDurationMs, attempt.Answer, outcome,
		gradingKind, attempt.EarnedPoints, run.Items[index].MaxPoints, taskRevision,
	); err != nil {
		t.Fatal(err)
	}
}
