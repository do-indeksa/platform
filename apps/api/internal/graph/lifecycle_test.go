package graph

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

const startRunMutation = `
mutation StartRun($input: StartRunInput!) {
  startRun(input: $input) {
    id
    kind
    status
    items { id taskId examPosition recentAttempts { id } }
  }
}`

const recordAttemptMutation = `
mutation RecordAttempt($input: RecordAttemptInput!) {
  recordAttempt(input: $input) {
    id
    runItemId
    taskId
    outcome
    gradingKind
    maxPoints
  }
}`

const submitRunMutation = `
mutation SubmitRun($input: SubmitRunInput!) {
  submitRun(input: $input) {
    id
    status
    activeDurationMs
    items { id recentAttempts { id outcome } }
  }
}`

func TestGraphQLRunLifecycle(t *testing.T) {
	session := seedGraphSession(t, "")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	runID := uuid.New().String()
	itemID := uuid.New().String()
	startVariables := map[string]any{"input": map[string]any{
		"id":               runID,
		"kind":             "PRACTICE",
		"blueprintVersion": "practice-v1",
		"contentRevision":  "content-revision",
		"startedAt":        startedAt,
		"items": []map[string]any{{
			"id":           itemID,
			"taskId":       "log-001",
			"examPosition": 3,
			"topic":        "logaritmi",
			"maxPoints":    6,
			"taskRevision": "task-revision",
		}},
	}}

	_, payload := graphRequest(t, startRunMutation, startVariables, session)
	requireGraphSuccess(t, payload)
	var started struct {
		StartRun struct {
			ID     string `json:"id"`
			Status string `json:"status"`
			Items  []struct {
				ID       string `json:"id"`
				Attempts []any  `json:"recentAttempts"`
			} `json:"items"`
		} `json:"startRun"`
	}
	if err := json.Unmarshal(payload.Data, &started); err != nil {
		t.Fatal(err)
	}
	if started.StartRun.ID != runID || started.StartRun.Status != "ACTIVE" ||
		len(started.StartRun.Items) != 1 || len(started.StartRun.Items[0].Attempts) != 0 {
		t.Fatalf("unexpected start result: %+v", started.StartRun)
	}

	_, retryPayload := graphRequest(t, startRunMutation, startVariables, session)
	requireGraphSuccess(t, retryPayload)

	attemptID := uuid.New().String()
	attemptVariables := map[string]any{"input": map[string]any{
		"id":               attemptID,
		"runItemId":        itemID,
		"startedAt":        startedAt.Add(time.Minute),
		"submittedAt":      startedAt.Add(2 * time.Minute),
		"activeDurationMs": 30_000,
		"answer":           "2",
		"outcome":          "CORRECT",
		"gradingKind":      "AUTO",
	}}
	_, payload = graphRequest(t, recordAttemptMutation, attemptVariables, session)
	requireGraphSuccess(t, payload)
	var recorded struct {
		RecordAttempt struct {
			ID          string `json:"id"`
			RunItemID   string `json:"runItemId"`
			Outcome     string `json:"outcome"`
			GradingKind string `json:"gradingKind"`
		} `json:"recordAttempt"`
	}
	if err := json.Unmarshal(payload.Data, &recorded); err != nil {
		t.Fatal(err)
	}
	if recorded.RecordAttempt.ID != attemptID || recorded.RecordAttempt.RunItemID != itemID ||
		recorded.RecordAttempt.Outcome != "CORRECT" || recorded.RecordAttempt.GradingKind != "AUTO" {
		t.Fatalf("unexpected attempt: %+v", recorded.RecordAttempt)
	}

	_, payload = graphRequest(t, `query Run($id: ID!) {
    run(id: $id) { id status items { id recentAttempts { id outcome } } }
    runs { id status }
  }`, map[string]any{"id": runID}, session)
	requireGraphSuccess(t, payload)
	var queried struct {
		Run struct {
			ID    string `json:"id"`
			Items []struct {
				Attempts []struct {
					ID string `json:"id"`
				} `json:"recentAttempts"`
			} `json:"items"`
		} `json:"run"`
		Runs []struct {
			ID string `json:"id"`
		} `json:"runs"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if queried.Run.ID != runID || len(queried.Run.Items) != 1 ||
		len(queried.Run.Items[0].Attempts) != 1 || queried.Run.Items[0].Attempts[0].ID != attemptID ||
		len(queried.Runs) != 1 || queried.Runs[0].ID != runID {
		t.Fatalf("unexpected query result: %+v", queried)
	}

	duration := int64(10 * time.Minute / time.Millisecond)
	submitVariables := map[string]any{"input": map[string]any{
		"id":               runID,
		"submittedAt":      startedAt.Add(20 * time.Minute),
		"activeDurationMs": duration,
	}}
	_, payload = graphRequest(t, submitRunMutation, submitVariables, session)
	requireGraphSuccess(t, payload)
	var submitted struct {
		SubmitRun struct {
			Status           string `json:"status"`
			ActiveDurationMs int64  `json:"activeDurationMs"`
		} `json:"submitRun"`
	}
	if err := json.Unmarshal(payload.Data, &submitted); err != nil {
		t.Fatal(err)
	}
	if submitted.SubmitRun.Status != "SUBMITTED" || submitted.SubmitRun.ActiveDurationMs != duration {
		t.Fatalf("unexpected submit: %+v", submitted.SubmitRun)
	}

	_, payload = graphRequest(t, recordAttemptMutation, attemptVariables, session)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, submitRunMutation, submitVariables, session)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, `query($id: ID!) {
    run(id: $id) { items { recentAttempts(limit: 21) { id } } }
  }`, map[string]any{"id": runID}, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")
}

func TestGraphQLRunOwnershipIsNotDisclosed(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	other := seedGraphSession(t, "-other")
	startedAt := time.Now().Add(-time.Minute).UTC().Truncate(time.Microsecond)
	runID := uuid.New().String()
	itemID := uuid.New().String()
	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": map[string]any{
		"id":               runID,
		"kind":             "PRACTICE",
		"blueprintVersion": "practice-v1",
		"contentRevision":  "content-revision",
		"startedAt":        startedAt,
		"items": []map[string]any{{
			"id":           itemID,
			"taskId":       "log-001",
			"examPosition": 3,
			"topic":        "logaritmi",
			"taskRevision": "task-revision",
		}},
	}}, owner)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, `query($id: ID!) { run(id: $id) { id } }`, map[string]any{"id": runID}, other)
	requireGraphSuccess(t, payload)
	var data struct {
		Run *struct {
			ID string `json:"id"`
		} `json:"run"`
	}
	if err := json.Unmarshal(payload.Data, &data); err != nil {
		t.Fatal(err)
	}
	if data.Run != nil {
		t.Fatalf("cross-user run disclosed: %+v", data.Run)
	}
}
