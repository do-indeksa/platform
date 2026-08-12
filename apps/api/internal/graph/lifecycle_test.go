package graph

import (
	"encoding/json"
	"net/http"
	"strings"
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
	    runs {
	      id status taskIds itemCount completedItemCount correctItemCount earnedPoints maxPoints
	    }
	    attempts { id runItemId taskRevision }
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
			ID                 string   `json:"id"`
			TaskIDs            []string `json:"taskIds"`
			ItemCount          int      `json:"itemCount"`
			CompletedItemCount int      `json:"completedItemCount"`
			CorrectItemCount   int      `json:"correctItemCount"`
			EarnedPoints       *int     `json:"earnedPoints"`
			MaxPoints          *int     `json:"maxPoints"`
		} `json:"runs"`
		Attempts []struct {
			ID           string  `json:"id"`
			RunItemID    *string `json:"runItemId"`
			TaskRevision *string `json:"taskRevision"`
		} `json:"attempts"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if queried.Run.ID != runID || len(queried.Run.Items) != 1 ||
		len(queried.Run.Items[0].Attempts) != 1 || queried.Run.Items[0].Attempts[0].ID != attemptID ||
		len(queried.Runs) != 1 || queried.Runs[0].ID != runID ||
		len(queried.Runs[0].TaskIDs) != 1 || queried.Runs[0].TaskIDs[0] != "log-001" ||
		queried.Runs[0].ItemCount != 1 || queried.Runs[0].CompletedItemCount != 1 ||
		queried.Runs[0].CorrectItemCount != 1 || queried.Runs[0].EarnedPoints != nil ||
		queried.Runs[0].MaxPoints == nil ||
		*queried.Runs[0].MaxPoints != 6 ||
		len(queried.Attempts) != 1 || queried.Attempts[0].ID != attemptID ||
		queried.Attempts[0].RunItemID == nil || *queried.Attempts[0].RunItemID != itemID ||
		queried.Attempts[0].TaskRevision == nil || *queried.Attempts[0].TaskRevision != "task-revision" {
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

func TestGraphQLStandaloneAttemptJournal(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	other := seedGraphSession(t, "-other")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	firstID := uuid.New().String()
	secondID := uuid.New().String()

	record := func(t *testing.T, session *http.Cookie, id, taskID string, position int, submittedAt time.Time) {
		t.Helper()
		_, payload := graphRequest(t, recordAttemptMutation, map[string]any{"input": map[string]any{
			"id": id,
			"standalone": map[string]any{
				"taskId":       taskID,
				"examPosition": position,
				"taskRevision": "sha256:" + strings.Repeat("a", 64),
			},
			"startedAt":        submittedAt.Add(-time.Minute),
			"submittedAt":      submittedAt,
			"activeDurationMs": 60_000,
			"answer":           "42",
			"outcome":          "CORRECT",
			"helpLevel":        1,
			"gradingKind":      "AUTO",
		}}, session)
		requireGraphSuccess(t, payload)
	}

	record(t, owner, firstID, "log-001", 3, startedAt.Add(10*time.Minute))
	record(t, owner, secondID, "eks-001", 4, startedAt.Add(20*time.Minute))
	record(t, other, uuid.New().String(), "other-001", 1, startedAt.Add(30*time.Minute))

	_, payload := graphRequest(t, `query {
		attempts(limit: 10) {
			id runItemId taskId examPosition mode activeDurationMs answer outcome
			helpLevel gradingKind taskRevision
		}
	}`, nil, owner)
	requireGraphSuccess(t, payload)
	var queried struct {
		Attempts []struct {
			ID               string  `json:"id"`
			RunItemID        *string `json:"runItemId"`
			TaskID           string  `json:"taskId"`
			ExamPosition     int     `json:"examPosition"`
			Mode             string  `json:"mode"`
			ActiveDurationMs int64   `json:"activeDurationMs"`
			Answer           string  `json:"answer"`
			Outcome          string  `json:"outcome"`
			HelpLevel        int     `json:"helpLevel"`
			GradingKind      string  `json:"gradingKind"`
			TaskRevision     *string `json:"taskRevision"`
		} `json:"attempts"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if len(queried.Attempts) != 2 || queried.Attempts[0].ID != firstID || queried.Attempts[1].ID != secondID {
		t.Fatalf("attempt journal is not chronological or user-scoped: %+v", queried.Attempts)
	}
	latest := queried.Attempts[1]
	if latest.RunItemID != nil || latest.TaskID != "eks-001" || latest.ExamPosition != 4 ||
		latest.Mode != "PRACTICE" || latest.ActiveDurationMs != 60_000 || latest.Answer != "42" ||
		latest.Outcome != "CORRECT" || latest.HelpLevel != 1 || latest.GradingKind != "AUTO" ||
		latest.TaskRevision == nil {
		t.Fatalf("rich standalone attempt was not preserved: %+v", latest)
	}

	_, payload = graphRequest(t, `query { attempts(limit: 1) { id } }`, nil, owner)
	requireGraphSuccess(t, payload)
	var limited struct {
		Attempts []struct {
			ID string `json:"id"`
		} `json:"attempts"`
	}
	if err := json.Unmarshal(payload.Data, &limited); err != nil {
		t.Fatal(err)
	}
	if len(limited.Attempts) != 1 || limited.Attempts[0].ID != secondID {
		t.Fatalf("journal limit kept the wrong attempt: %+v", limited.Attempts)
	}
}

func TestGraphQLCompletedSimulationArchive(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	other := seedGraphSession(t, "-other")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	runID := uuid.New().String()
	itemID := uuid.New().String()
	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": map[string]any{
		"id":               runID,
		"kind":             "SIMULATION",
		"blueprintVersion": "ftn-p1:2026.1",
		"contentRevision":  "sha256:" + strings.Repeat("a", 64),
		"startedAt":        startedAt,
		"deadlineAt":       startedAt.Add(4 * time.Hour),
		"items": []map[string]any{{
			"id":           itemID,
			"taskId":       "log-001",
			"examPosition": 1,
			"topic":        "logaritmi",
			"maxPoints":    6,
			"taskRevision": "sha256:" + strings.Repeat("b", 64),
		}},
	}}, owner)
	requireGraphSuccess(t, payload)

	attemptID := uuid.New().String()
	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": map[string]any{
		"id":               attemptID,
		"runItemId":        itemID,
		"startedAt":        startedAt.Add(time.Minute),
		"submittedAt":      startedAt.Add(2 * time.Minute),
		"activeDurationMs": 60_000,
		"answer":           "[\"41\"]",
		"outcome":          "INCORRECT",
		"gradingKind":      "AUTO",
		"earnedPoints":     0,
	}}, owner)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": map[string]any{
		"id":               uuid.New().String(),
		"runItemId":        itemID,
		"startedAt":        startedAt.Add(time.Minute),
		"submittedAt":      startedAt.Add(2 * time.Minute),
		"activeDurationMs": 60_000,
		"answer":           "[\"41\"]",
		"outcome":          "PARTIAL",
		"gradingKind":      "RUBRIC_SELF",
		"earnedPoints":     4,
	}}, owner)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": map[string]any{
		"id":               runID,
		"submittedAt":      startedAt.Add(20 * time.Minute),
		"activeDurationMs": 18 * 60_000,
	}}, owner)
	requireGraphSuccess(t, payload)

	query := `query {
		completedSimulationRuns {
			id blueprintVersion contentRevision startedAt deadlineAt submittedAt activeDurationMs
			items { taskId examPosition topic maxPoints taskRevision answer outcome gradingKind earnedPoints }
		}
	}`
	_, payload = graphRequest(t, query, nil, owner)
	requireGraphSuccess(t, payload)
	var queried struct {
		Runs []struct {
			ID               string `json:"id"`
			BlueprintVersion string `json:"blueprintVersion"`
			ActiveDurationMs int64  `json:"activeDurationMs"`
			Items            []struct {
				TaskID       string `json:"taskId"`
				Answer       string `json:"answer"`
				Outcome      string `json:"outcome"`
				GradingKind  string `json:"gradingKind"`
				EarnedPoints int    `json:"earnedPoints"`
			} `json:"items"`
		} `json:"completedSimulationRuns"`
	}
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if len(queried.Runs) != 1 || queried.Runs[0].ID != runID ||
		queried.Runs[0].BlueprintVersion != "ftn-p1:2026.1" ||
		queried.Runs[0].ActiveDurationMs != 18*60_000 || len(queried.Runs[0].Items) != 1 ||
		queried.Runs[0].Items[0].TaskID != "log-001" || queried.Runs[0].Items[0].Answer != "[\"41\"]" ||
		queried.Runs[0].Items[0].Outcome != "PARTIAL" ||
		queried.Runs[0].Items[0].GradingKind != "RUBRIC_SELF" || queried.Runs[0].Items[0].EarnedPoints != 4 {
		t.Fatalf("unexpected completed simulation GraphQL payload: %+v", queried.Runs)
	}

	_, payload = graphRequest(t, query, nil, other)
	requireGraphSuccess(t, payload)
	if err := json.Unmarshal(payload.Data, &queried); err != nil {
		t.Fatal(err)
	}
	if len(queried.Runs) != 0 {
		t.Fatalf("cross-user completed simulations leaked: %+v", queried.Runs)
	}
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
