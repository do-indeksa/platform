package graph

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGraphQLSnapshottedPracticeRoundTrip(t *testing.T) {
	session := seedGraphSession(t, "-snapshotted-practice")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	runID := uuid.New()
	itemIDs := []uuid.UUID{
		uuid.NewSHA1(runID, []byte("run-item:task-1")),
		uuid.NewSHA1(runID, []byte("run-item:task-2")),
	}
	items := []map[string]any{
		{
			"id": itemIDs[0].String(), "taskId": "task-1", "examPosition": 4,
			"topic": "algebra", "answerPartCount": 2,
			"taskRevision": "sha256:" + strings.Repeat("b", 64),
		},
		{
			"id": itemIDs[1].String(), "taskId": "task-2", "examPosition": 4,
			"topic": "algebra", "answerPartCount": 1,
			"taskRevision": "sha256:" + strings.Repeat("c", 64),
		},
	}

	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": map[string]any{
		"id": runID.String(), "kind": "PRACTICE",
		"blueprintVersion": "ftn-p1:2026.1",
		"contentRevision":  "sha256:" + strings.Repeat("a", 64),
		"startedAt":        startedAt, "items": items,
	}}, session)
	requireGraphSuccess(t, payload)

	firstDraft := `{"version":1,"nextAttempt":1,"answers":["first",""],"helpLevel":0}`
	_, payload = graphRequest(t, checkpointRunMutation, map[string]any{"input": map[string]any{
		"id": runID.String(), "expectedVersion": 0, "currentOrdinal": 1,
		"drafts": []map[string]any{{"runItemId": itemIDs[0].String(), "answer": firstDraft}},
	}}, session)
	requireGraphSuccess(t, payload)

	firstSubmittedAt := startedAt.Add(time.Minute)
	firstAttempt := practiceAttemptInput(
		itemIDs[0], 1, startedAt, firstSubmittedAt, `["first",""]`, "INCORRECT", 0,
	)
	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": firstAttempt}, session)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": firstAttempt}, session)
	requireGraphSuccess(t, payload)

	secondDraft := `{"version":1,"nextAttempt":2,"answers":["second",""],"helpLevel":1}`
	_, payload = graphRequest(t, checkpointRunMutation, map[string]any{"input": map[string]any{
		"id": runID.String(), "expectedVersion": 1, "currentOrdinal": 1,
		"drafts": []map[string]any{{"runItemId": itemIDs[0].String(), "answer": secondDraft}},
	}}, session)
	requireGraphSuccess(t, payload)

	secondSubmittedAt := firstSubmittedAt.Add(time.Minute)
	secondAttempt := practiceAttemptInput(
		itemIDs[0], 2, firstSubmittedAt, secondSubmittedAt, `["second",""]`, "CORRECT", 1,
	)
	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": secondAttempt}, session)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, `query PracticeRun($id: ID!) {
		run(id: $id) {
			id status
			checkpoint { version currentOrdinal drafts { runItemId answer } }
			items {
				id examPosition answerPartCount
				recentAttempts { id outcome helpLevel gradingKind answer }
			}
		}
		runs { id itemCount completedItemCount correctItemCount }
	}`, map[string]any{"id": runID.String()}, session)
	requireGraphSuccess(t, payload)
	var active struct {
		Run struct {
			ID         string `json:"id"`
			Status     string `json:"status"`
			Checkpoint *struct {
				Version        int64 `json:"version"`
				CurrentOrdinal int   `json:"currentOrdinal"`
				Drafts         []any `json:"drafts"`
			} `json:"checkpoint"`
			Items []struct {
				ID              string `json:"id"`
				ExamPosition    int    `json:"examPosition"`
				AnswerPartCount int    `json:"answerPartCount"`
				Attempts        []struct {
					ID          string `json:"id"`
					Outcome     string `json:"outcome"`
					HelpLevel   int    `json:"helpLevel"`
					GradingKind string `json:"gradingKind"`
					Answer      string `json:"answer"`
				} `json:"recentAttempts"`
			} `json:"items"`
		} `json:"run"`
		Runs []struct {
			ID                 string `json:"id"`
			ItemCount          int    `json:"itemCount"`
			CompletedItemCount int    `json:"completedItemCount"`
			CorrectItemCount   int    `json:"correctItemCount"`
		} `json:"runs"`
	}
	if err := json.Unmarshal(payload.Data, &active); err != nil {
		t.Fatal(err)
	}
	if active.Run.ID != runID.String() || active.Run.Status != "ACTIVE" ||
		active.Run.Checkpoint == nil || active.Run.Checkpoint.Version != 2 ||
		active.Run.Checkpoint.CurrentOrdinal != 1 || len(active.Run.Checkpoint.Drafts) != 0 ||
		len(active.Run.Items) != 2 || active.Run.Items[0].ExamPosition != 4 ||
		active.Run.Items[1].ExamPosition != 4 || len(active.Run.Items[0].Attempts) != 2 ||
		len(active.Run.Items[1].Attempts) != 0 || len(active.Runs) != 1 ||
		active.Runs[0].ID != runID.String() || active.Runs[0].ItemCount != 2 ||
		active.Runs[0].CompletedItemCount != 1 || active.Runs[0].CorrectItemCount != 1 {
		t.Fatalf("unexpected active practice: %+v", active.Run)
	}
	for index, attempt := range active.Run.Items[0].Attempts {
		expectedOutcome := []string{"INCORRECT", "CORRECT"}[index]
		if attempt.ID != uuid.NewSHA1(itemIDs[0], []byte("attempt:"+strconv.Itoa(index+1))).String() ||
			attempt.Outcome != expectedOutcome || attempt.HelpLevel != index ||
			attempt.GradingKind != "AUTO" {
			t.Fatalf("unexpected attempt %d: %+v", index, attempt)
		}
	}

	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": map[string]any{
		"id": runID.String(), "submittedAt": secondSubmittedAt.Add(time.Minute),
		"activeDurationMs": 2 * 60_000,
	}}, session)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, `query SubmittedPractice($id: ID!) {
		run(id: $id) { status checkpoint { version } items { id recentAttempts { id } } }
	}`, map[string]any{"id": runID.String()}, session)
	requireGraphSuccess(t, payload)
	var submitted struct {
		Run struct {
			Status     string `json:"status"`
			Checkpoint any    `json:"checkpoint"`
			Items      []struct {
				Attempts []any `json:"recentAttempts"`
			} `json:"items"`
		} `json:"run"`
	}
	if err := json.Unmarshal(payload.Data, &submitted); err != nil {
		t.Fatal(err)
	}
	if submitted.Run.Status != "SUBMITTED" || submitted.Run.Checkpoint != nil ||
		len(submitted.Run.Items) != 2 || len(submitted.Run.Items[0].Attempts) != 2 ||
		len(submitted.Run.Items[1].Attempts) != 0 {
		t.Fatalf("unexpected submitted practice: %+v", submitted.Run)
	}
}

func practiceAttemptInput(
	itemID uuid.UUID,
	number int,
	startedAt, submittedAt time.Time,
	answer, outcome string,
	helpLevel int,
) map[string]any {
	return map[string]any{
		"id":        uuid.NewSHA1(itemID, []byte("attempt:"+strconv.Itoa(number))).String(),
		"runItemId": itemID.String(), "startedAt": startedAt, "submittedAt": submittedAt,
		"activeDurationMs": submittedAt.Sub(startedAt).Milliseconds(),
		"answer":           answer, "outcome": outcome, "helpLevel": helpLevel, "gradingKind": "AUTO",
	}
}
