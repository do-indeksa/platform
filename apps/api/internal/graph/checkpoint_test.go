package graph

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

const checkpointRunMutation = `
mutation CheckpointRun($input: CheckpointRunInput!) {
  checkpointRun(input: $input) {
    version
    currentOrdinal
    activeDurationMs
    updatedAt
    drafts { runItemId answer }
  }
}`

const abandonRunMutation = `
mutation AbandonRun($input: AbandonRunInput!) {
  abandonRun(input: $input) {
    id
    status
    checkpoint { version }
  }
}`

const submitRunWithCheckpointMutation = `
mutation SubmitRun($input: SubmitRunInput!) {
  submitRun(input: $input) {
    id
    status
    checkpoint { version }
  }
}`

func TestGraphQLRunCheckpointVersioningAndOwnership(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	other := seedGraphSession(t, "-other")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	runID := uuid.New().String()
	itemID := uuid.New().String()
	_, payload := graphRequest(t, startRunMutation, checkpointStartVariables(runID, itemID, startedAt), owner)
	requireGraphSuccess(t, payload)

	checkpointVariables := map[string]any{"input": map[string]any{
		"id":               runID,
		"expectedVersion":  0,
		"currentOrdinal":   1,
		"activeDurationMs": 30_000,
		"drafts": []map[string]any{{
			"runItemId": itemID,
			"answer":    `["42"]`,
		}},
	}}
	_, payload = graphRequest(t, checkpointRunMutation, checkpointVariables, owner)
	requireGraphSuccess(t, payload)
	var checkpointed struct {
		Checkpoint struct {
			Version        int64 `json:"version"`
			CurrentOrdinal int   `json:"currentOrdinal"`
			Drafts         []struct {
				RunItemID string `json:"runItemId"`
				Answer    string `json:"answer"`
			} `json:"drafts"`
		} `json:"checkpointRun"`
	}
	if err := json.Unmarshal(payload.Data, &checkpointed); err != nil {
		t.Fatal(err)
	}
	if checkpointed.Checkpoint.Version != 1 || checkpointed.Checkpoint.CurrentOrdinal != 1 ||
		len(checkpointed.Checkpoint.Drafts) != 1 ||
		checkpointed.Checkpoint.Drafts[0].RunItemID != itemID ||
		checkpointed.Checkpoint.Drafts[0].Answer != `["42"]` {
		t.Fatalf("unexpected checkpoint: %+v", checkpointed.Checkpoint)
	}

	staleVariables := map[string]any{"input": map[string]any{
		"id": runID, "expectedVersion": 0, "currentOrdinal": 1,
		"drafts": []map[string]any{{"runItemId": itemID, "answer": `["changed"]`}},
	}}
	_, payload = graphRequest(t, checkpointRunMutation, staleVariables, owner)
	requireGraphCode(t, payload, "CONFLICT")

	_, payload = graphRequest(t, `query RunCheckpoint($id: ID!) {
		run(id: $id) { id checkpoint { version drafts { runItemId answer } } }
	}`, map[string]any{"id": runID}, owner)
	requireGraphSuccess(t, payload)
	var queried struct {
		Run struct {
			Checkpoint struct {
				Version int64 `json:"version"`
				Drafts  []struct {
					Answer string `json:"answer"`
				} `json:"drafts"`
			} `json:"checkpoint"`
		} `json:"run"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if queried.Run.Checkpoint.Version != 1 || len(queried.Run.Checkpoint.Drafts) != 1 ||
		queried.Run.Checkpoint.Drafts[0].Answer != `["42"]` {
		t.Fatalf("stale mutation changed checkpoint: %+v", queried.Run.Checkpoint)
	}

	otherVariables := map[string]any{"input": map[string]any{
		"id": runID, "expectedVersion": 1, "currentOrdinal": 1,
	}}
	_, payload = graphRequest(t, checkpointRunMutation, otherVariables, other)
	requireGraphCode(t, payload, "NOT_FOUND")
	_, payload = graphRequest(t, abandonRunMutation, map[string]any{
		"input": map[string]any{"id": runID},
	}, other)
	requireGraphCode(t, payload, "NOT_FOUND")

	_, payload = graphRequest(t, checkpointRunMutation, map[string]any{"input": map[string]any{
		"id": runID, "expectedVersion": 1, "currentOrdinal": 1,
		"drafts": []map[string]any{{"runItemId": uuid.New().String(), "answer": "42"}},
	}}, owner)
	requireGraphCode(t, payload, "BAD_USER_INPUT")
}

func TestGraphQLAbandonAndSubmitDeleteCheckpoints(t *testing.T) {
	session := seedGraphSession(t, "")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)

	abandonedRunID := uuid.New().String()
	abandonedItemID := uuid.New().String()
	_, payload := graphRequest(
		t,
		startRunMutation,
		checkpointStartVariables(abandonedRunID, abandonedItemID, startedAt),
		session,
	)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, checkpointRunMutation, map[string]any{"input": map[string]any{
		"id": abandonedRunID, "expectedVersion": 0, "currentOrdinal": 1,
	}}, session)
	requireGraphSuccess(t, payload)

	abandonVariables := map[string]any{"input": map[string]any{"id": abandonedRunID}}
	_, payload = graphRequest(t, abandonRunMutation, abandonVariables, session)
	requireGraphSuccess(t, payload)
	var abandoned struct {
		Run struct {
			Status     string `json:"status"`
			Checkpoint any    `json:"checkpoint"`
		} `json:"abandonRun"`
	}
	if err := json.Unmarshal(payload.Data, &abandoned); err != nil {
		t.Fatal(err)
	}
	if abandoned.Run.Status != "ABANDONED" || abandoned.Run.Checkpoint != nil {
		t.Fatalf("unexpected abandoned run: %+v", abandoned.Run)
	}
	_, payload = graphRequest(t, abandonRunMutation, abandonVariables, session)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, checkpointRunMutation, map[string]any{"input": map[string]any{
		"id": abandonedRunID, "expectedVersion": 1, "currentOrdinal": 1,
	}}, session)
	requireGraphCode(t, payload, "INVALID_STATE")

	submittedRunID := uuid.New().String()
	submittedItemID := uuid.New().String()
	_, payload = graphRequest(
		t,
		startRunMutation,
		checkpointStartVariables(submittedRunID, submittedItemID, startedAt),
		session,
	)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, checkpointRunMutation, map[string]any{"input": map[string]any{
		"id": submittedRunID, "expectedVersion": 0, "currentOrdinal": 1,
	}}, session)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, submitRunWithCheckpointMutation, map[string]any{"input": map[string]any{
		"id": submittedRunID, "submittedAt": startedAt.Add(30 * time.Minute),
	}}, session)
	requireGraphSuccess(t, payload)
	var submitted struct {
		Run struct {
			Status     string `json:"status"`
			Checkpoint any    `json:"checkpoint"`
		} `json:"submitRun"`
	}
	if err := json.Unmarshal(payload.Data, &submitted); err != nil {
		t.Fatal(err)
	}
	if submitted.Run.Status != "SUBMITTED" || submitted.Run.Checkpoint != nil {
		t.Fatalf("unexpected submitted run: %+v", submitted.Run)
	}
}

func checkpointStartVariables(runID, itemID string, startedAt time.Time) map[string]any {
	return map[string]any{"input": map[string]any{
		"id":               runID,
		"kind":             "DIAGNOSTIC",
		"blueprintVersion": "diagnostic-v1",
		"contentRevision":  "content-revision",
		"startedAt":        startedAt,
		"items": []map[string]any{{
			"id": itemID, "taskId": "log-001", "examPosition": 3,
			"topic": "logaritmi", "taskRevision": "task-revision",
		}},
	}}
}
