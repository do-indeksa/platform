package graph

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGraphQLSnapshottedSimulationRoundTrip(t *testing.T) {
	session := seedGraphSession(t, "-snapshotted-simulation")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	submittedAt := startedAt.Add(20 * time.Minute)
	runID := uuid.New()
	itemIDs := make([]uuid.UUID, 10)
	items := make([]map[string]any, 10)
	for index := range items {
		taskID := fmt.Sprintf("task-%d", index+1)
		itemIDs[index] = uuid.NewSHA1(runID, []byte("run-item:"+taskID))
		answerPartCount := 1
		if index == 0 {
			answerPartCount = 2
		}
		items[index] = map[string]any{
			"id":              itemIDs[index].String(),
			"taskId":          taskID,
			"examPosition":    index + 1,
			"topic":           fmt.Sprintf("topic-%d", index+1),
			"maxPoints":       6,
			"answerPartCount": answerPartCount,
			"taskRevision":    "sha256:" + strings.Repeat("b", 64),
		}
	}

	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": map[string]any{
		"id":               runID.String(),
		"kind":             "SIMULATION",
		"blueprintVersion": "ftn-p1:2026.1",
		"contentRevision":  "sha256:" + strings.Repeat("a", 64),
		"startedAt":        startedAt,
		"deadlineAt":       startedAt.Add(4 * time.Hour),
		"items":            items,
	}}, session)
	requireGraphSuccess(t, payload)

	invalid := simulationAttemptInput(
		uuid.New(), itemIDs[0], startedAt, submittedAt,
		"[\"41\",\"\"]", "INCORRECT", "AUTO", 0,
	)
	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": invalid}, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")

	for index, itemID := range itemIDs {
		input := simulationAttemptInput(
			uuid.NewSHA1(itemID, []byte("attempt:1")), itemID,
			startedAt, submittedAt, "", "SKIPPED", "AUTO", nil,
		)
		if index == 0 {
			input = simulationAttemptInput(
				uuid.NewSHA1(itemID, []byte("attempt:1")), itemID,
				startedAt, submittedAt, "[\"41\",\"\"]", "INCORRECT", "AUTO", 0,
			)
		}
		_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": input}, session)
		requireGraphSuccess(t, payload)
	}
	rubric := simulationAttemptInput(
		uuid.NewSHA1(itemIDs[0], []byte("attempt:rubric-self:1")), itemIDs[0],
		startedAt, submittedAt, "[\"41\",\"\"]", "PARTIAL", "RUBRIC_SELF", 3,
	)
	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": rubric}, session)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": map[string]any{
		"id": runID.String(), "submittedAt": submittedAt, "activeDurationMs": 18 * 60_000,
	}}, session)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, `query {
		completedSimulationRuns {
			id
			items { answerPartCount answer outcome gradingKind earnedPoints }
		}
	}`, nil, session)
	requireGraphSuccess(t, payload)
	var result struct {
		Runs []struct {
			ID    string `json:"id"`
			Items []struct {
				AnswerPartCount int    `json:"answerPartCount"`
				Answer          string `json:"answer"`
				Outcome         string `json:"outcome"`
				GradingKind     string `json:"gradingKind"`
				EarnedPoints    int    `json:"earnedPoints"`
			} `json:"items"`
		} `json:"completedSimulationRuns"`
	}
	if err := json.Unmarshal(payload.Data, &result); err != nil {
		t.Fatal(err)
	}
	if len(result.Runs) != 1 || result.Runs[0].ID != runID.String() ||
		len(result.Runs[0].Items) != 10 || result.Runs[0].Items[0].AnswerPartCount != 2 ||
		result.Runs[0].Items[0].Answer != "[\"41\",\"\"]" ||
		result.Runs[0].Items[0].Outcome != "PARTIAL" ||
		result.Runs[0].Items[0].GradingKind != "RUBRIC_SELF" ||
		result.Runs[0].Items[0].EarnedPoints != 3 {
		t.Fatalf("unexpected snapshotted simulation: %+v", result.Runs)
	}
}

func simulationAttemptInput(
	attemptID, itemID uuid.UUID,
	startedAt, submittedAt time.Time,
	answer, outcome, gradingKind string,
	earnedPoints any,
) map[string]any {
	input := map[string]any{
		"id": attemptID.String(), "runItemId": itemID.String(),
		"startedAt": startedAt, "submittedAt": submittedAt,
		"outcome": outcome, "gradingKind": gradingKind,
	}
	if answer != "" {
		input["answer"] = answer
	}
	if earnedPoints != nil {
		input["earnedPoints"] = earnedPoints
	}
	return input
}
