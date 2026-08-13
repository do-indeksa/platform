package graph

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGraphQLPreservesRunCausalityAndSubmitIdempotency(t *testing.T) {
	session := seedGraphSession(t, "")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	runID := uuid.New().String()
	itemID := uuid.New().String()
	_, payload := graphRequest(
		t,
		startRunMutation,
		checkpointStartVariables(runID, itemID, startedAt),
		session,
	)
	requireGraphSuccess(t, payload)

	attemptInput := map[string]any{
		"id":          uuid.New().String(),
		"runItemId":   itemID,
		"startedAt":   startedAt.Add(-time.Minute),
		"submittedAt": startedAt.Add(time.Minute),
		"answer":      "42",
		"outcome":     "CORRECT",
		"gradingKind": "AUTO",
	}
	_, payload = graphRequest(
		t,
		recordAttemptMutation,
		map[string]any{"input": attemptInput},
		session,
	)
	requireGraphCode(t, payload, "BAD_USER_INPUT")

	attemptInput["id"] = uuid.New().String()
	attemptInput["startedAt"] = startedAt.Add(10 * time.Minute)
	attemptInput["submittedAt"] = startedAt.Add(20 * time.Minute)
	_, payload = graphRequest(
		t,
		recordAttemptMutation,
		map[string]any{"input": attemptInput},
		session,
	)
	requireGraphSuccess(t, payload)

	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": map[string]any{
		"id": runID, "submittedAt": startedAt.Add(19 * time.Minute),
	}}, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")

	duration := int64(18 * time.Minute / time.Millisecond)
	canonical := map[string]any{
		"id": runID, "submittedAt": startedAt.Add(30 * time.Minute), "activeDurationMs": duration,
	}
	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": canonical}, session)
	requireGraphSuccess(t, payload)
	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": canonical}, session)
	requireGraphSuccess(t, payload)

	changed := map[string]any{
		"id": runID, "submittedAt": startedAt.Add(30 * time.Minute), "activeDurationMs": duration - 1,
	}
	_, payload = graphRequest(t, submitRunMutation, map[string]any{"input": changed}, session)
	requireGraphCode(t, payload, "CONFLICT")
}
