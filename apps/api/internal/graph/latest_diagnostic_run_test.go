package graph

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"
)

const latestSubmittedDiagnosticRunQuery = `
query LatestSubmittedDiagnosticRun {
  latestSubmittedDiagnosticRun { id submittedAt }
}`

func TestGraphQLLatestSubmittedDiagnosticRunIsNullableAndOwnerScoped(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	other := seedGraphSession(t, "-other")

	_, emptyPayload := graphRequest(t, latestSubmittedDiagnosticRunQuery, nil, owner)
	requireGraphSuccess(t, emptyPayload)
	var empty struct {
		Latest *struct {
			ID string `json:"id"`
		} `json:"latestSubmittedDiagnosticRun"`
	}
	if err := json.Unmarshal(emptyPayload.Data, &empty); err != nil {
		t.Fatal(err)
	}
	if empty.Latest != nil {
		t.Fatalf("empty owner returned a marker: %+v", empty.Latest)
	}

	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	submittedAt := startedAt.Add(20 * time.Minute)
	runID := uuid.New().String()
	itemID := uuid.New().String()
	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": map[string]any{
		"id":               runID,
		"kind":             "DIAGNOSTIC",
		"blueprintVersion": "ftn-p1:2026.1",
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
	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": map[string]any{
		"id": runID, "submittedAt": submittedAt,
	}}, owner)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, latestSubmittedDiagnosticRunQuery, nil, owner)
	requireGraphSuccess(t, payload)
	var queried struct {
		Latest *struct {
			ID          string    `json:"id"`
			SubmittedAt time.Time `json:"submittedAt"`
		} `json:"latestSubmittedDiagnosticRun"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if queried.Latest == nil || queried.Latest.ID != runID ||
		!queried.Latest.SubmittedAt.Equal(submittedAt) {
		t.Fatalf("unexpected marker: %+v", queried.Latest)
	}

	_, otherPayload := graphRequest(t, latestSubmittedDiagnosticRunQuery, nil, other)
	requireGraphSuccess(t, otherPayload)
	if err := json.Unmarshal(otherPayload.Data, &empty); err != nil {
		t.Fatal(err)
	}
	if empty.Latest != nil {
		t.Fatalf("marker leaked to another owner: %+v", empty.Latest)
	}

	_, anonymousPayload := graphRequest(t, latestSubmittedDiagnosticRunQuery, nil, nil)
	requireGraphCode(t, anonymousPayload, "UNAUTHENTICATED")
}
