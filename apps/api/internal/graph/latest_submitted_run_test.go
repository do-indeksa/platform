package graph

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGraphQLLatestSubmittedRunIsOwnerScoped(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	other := seedGraphSession(t, "-other")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	query := `query LatestDiagnostic {
		latestSubmittedRun(kind: DIAGNOSTIC) { id kind submittedAt }
	}`

	assertLatestSubmittedRun(t, query, owner, "")

	activeID := uuid.New().String()
	startGraphRun(t, owner, activeID, startedAt)
	assertLatestSubmittedRun(t, query, owner, "")
	_, payload := graphRequest(t, `mutation($input: AbandonRunInput!) {
		abandonRun(input: $input) { id status }
	}`, map[string]any{"input": map[string]any{"id": activeID}}, owner)
	requireGraphSuccess(t, payload)
	assertLatestSubmittedRun(t, query, owner, "")

	submittedID := uuid.New().String()
	startGraphRun(t, owner, submittedID, startedAt.Add(time.Minute))
	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": map[string]any{
		"id": submittedID, "submittedAt": startedAt.Add(20 * time.Minute),
	}}, owner)
	requireGraphSuccess(t, payload)

	assertLatestSubmittedRun(t, query, owner, submittedID)
	assertLatestSubmittedRun(t, query, other, "")
}

func startGraphRun(t *testing.T, session *http.Cookie, runID string, startedAt time.Time) {
	t.Helper()
	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": map[string]any{
		"id":               runID,
		"kind":             "DIAGNOSTIC",
		"blueprintVersion": "diagnostic-v1",
		"contentRevision":  "content-revision",
		"startedAt":        startedAt,
		"items": []map[string]any{{
			"id":           uuid.New().String(),
			"taskId":       "log-001",
			"examPosition": 3,
			"topic":        "logaritmi",
			"taskRevision": "task-revision",
		}},
	}}, session)
	requireGraphSuccess(t, payload)
}

func assertLatestSubmittedRun(t *testing.T, query string, session *http.Cookie, wantID string) {
	t.Helper()
	_, payload := graphRequest(t, query, nil, session)
	requireGraphSuccess(t, payload)
	var queried struct {
		Run *struct {
			ID          string    `json:"id"`
			Kind        string    `json:"kind"`
			SubmittedAt time.Time `json:"submittedAt"`
		} `json:"latestSubmittedRun"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if wantID == "" {
		if queried.Run != nil {
			t.Fatalf("unexpected latest submitted run: %+v", queried.Run)
		}
		return
	}
	if queried.Run == nil || queried.Run.ID != wantID ||
		queried.Run.Kind != "DIAGNOSTIC" || queried.Run.SubmittedAt.IsZero() {
		t.Fatalf("latest submitted run = %+v, want %s", queried.Run, wantID)
	}
}
