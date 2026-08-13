package graph

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGraphQLRejectsDatabaseInvalidProgressTextAsUserInput(t *testing.T) {
	session := seedGraphSession(t, "")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	runID := uuid.New().String()
	itemID := uuid.New().String()
	startInput := map[string]any{
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
	}

	_, payload := graphRequest(t, startRunMutation, map[string]any{"input": startInput}, session)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, recordAttemptMutation, map[string]any{"input": map[string]any{
		"id":          uuid.New().String(),
		"runItemId":   itemID,
		"startedAt":   startedAt.Add(time.Minute),
		"submittedAt": startedAt.Add(2 * time.Minute),
		"answer":      "before\x00after",
		"outcome":     "CORRECT",
		"gradingKind": "AUTO",
	}}, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")

	startInput["id"] = uuid.New().String()
	startInput["blueprintVersion"] = "practice\x00v1"
	_, payload = graphRequest(t, startRunMutation, map[string]any{"input": startInput}, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")
}
