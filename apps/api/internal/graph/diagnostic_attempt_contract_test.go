package graph

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGraphQLSnapshottedDiagnosticRoundTrip(t *testing.T) {
	session := seedGraphSession(t, "-snapshotted-diagnostic")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
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
			"answerPartCount": answerPartCount,
			"taskRevision":    "sha256:" + strings.Repeat(fmt.Sprintf("%x", index), 64),
		}
	}

	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": map[string]any{
		"id":               runID.String(),
		"kind":             "DIAGNOSTIC",
		"blueprintVersion": "ftn-p1:2026.1",
		"contentRevision":  "sha256:" + strings.Repeat("a", 64),
		"startedAt":        startedAt,
		"items":            items,
	}}, session)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, checkpointRunMutation, map[string]any{"input": map[string]any{
		"id": runID.String(), "expectedVersion": 0, "currentOrdinal": 1,
		"drafts": []map[string]any{{
			"runItemId": itemIDs[0].String(), "answer": `["42",""]`,
		}},
	}}, session)
	requireGraphSuccess(t, payload)

	previousSubmittedAt := startedAt
	for index, itemID := range itemIDs {
		submittedAt := previousSubmittedAt.Add(time.Minute)
		input := map[string]any{
			"id":          uuid.NewSHA1(itemID, []byte("attempt:1")).String(),
			"runItemId":   itemID.String(),
			"startedAt":   previousSubmittedAt,
			"submittedAt": submittedAt,
			"outcome":     "CORRECT",
			"gradingKind": "AUTO",
			"answer":      `["42"]`,
		}
		if index == 0 {
			input["answer"] = `["42",""]`
		}
		_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": input}, session)
		requireGraphSuccess(t, payload)
		previousSubmittedAt = submittedAt
	}

	_, payload = graphRequest(t, `query DiagnosticRun($id: ID!) {
		run(id: $id) {
			id status
			checkpoint { version currentOrdinal drafts { runItemId answer } }
			items {
				id ordinal examPosition answerPartCount
				recentAttempts { id startedAt submittedAt outcome gradingKind }
			}
		}
	}`, map[string]any{"id": runID.String()}, session)
	requireGraphSuccess(t, payload)
	var queried struct {
		Run struct {
			ID         string `json:"id"`
			Status     string `json:"status"`
			Checkpoint struct {
				Version        int64 `json:"version"`
				CurrentOrdinal int   `json:"currentOrdinal"`
				Drafts         []any `json:"drafts"`
			} `json:"checkpoint"`
			Items []struct {
				ID              string `json:"id"`
				Ordinal         int    `json:"ordinal"`
				ExamPosition    int    `json:"examPosition"`
				AnswerPartCount int    `json:"answerPartCount"`
				Attempts        []struct {
					ID          string `json:"id"`
					Outcome     string `json:"outcome"`
					GradingKind string `json:"gradingKind"`
				} `json:"recentAttempts"`
			} `json:"items"`
		} `json:"run"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if queried.Run.ID != runID.String() || queried.Run.Status != "ACTIVE" ||
		queried.Run.Checkpoint.Version != 1 || queried.Run.Checkpoint.CurrentOrdinal != 10 ||
		len(queried.Run.Checkpoint.Drafts) != 0 || len(queried.Run.Items) != 10 {
		t.Fatalf("unexpected active diagnostic: %+v", queried.Run)
	}
	for index, item := range queried.Run.Items {
		if item.ID != itemIDs[index].String() || item.Ordinal != index+1 ||
			item.ExamPosition != index+1 || len(item.Attempts) != 1 ||
			item.Attempts[0].ID != uuid.NewSHA1(itemIDs[index], []byte("attempt:1")).String() ||
			item.Attempts[0].Outcome != "CORRECT" || item.Attempts[0].GradingKind != "AUTO" {
			t.Fatalf("unexpected item %d: %+v", index, item)
		}
	}

	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": map[string]any{
		"id": runID.String(), "submittedAt": previousSubmittedAt,
	}}, session)
	requireGraphSuccess(t, payload)
}
