package graph

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

const prepPreferencesQuery = `query PrepPreferences {
	prepPreferences { goalPoints examDate version updatedAt }
}`

const savePrepPreferencesMutation = `mutation SavePrepPreferences($input: SavePrepPreferencesInput!) {
	savePrepPreferences(input: $input) { goalPoints examDate version updatedAt }
}`

type prepPreferencesPayload struct {
	GoalPoints int32     `json:"goalPoints"`
	ExamDate   string    `json:"examDate"`
	Version    int64     `json:"version"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

func TestGraphQLPrepPreferencesAreOwnerScopedAndVersioned(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	other := seedGraphSession(t, "-other")

	assertGraphPrepPreferences(t, owner, nil)
	assertGraphPrepPreferences(t, other, nil)

	created := saveGraphPrepPreferences(t, owner, 0, 42, "2028-02-29")
	if created.Version != 1 || created.GoalPoints != 42 ||
		created.ExamDate != "2028-02-29" || created.UpdatedAt.IsZero() {
		t.Fatalf("created preferences = %+v", created)
	}
	assertGraphPrepPreferences(t, owner, &created)
	assertGraphPrepPreferences(t, other, nil)

	updated := saveGraphPrepPreferences(t, owner, created.Version, 50, "2029-06-28")
	if updated.Version != 2 || updated.GoalPoints != 50 || updated.ExamDate != "2029-06-28" {
		t.Fatalf("updated preferences = %+v", updated)
	}

	_, payload := graphRequest(t, savePrepPreferencesMutation, map[string]any{
		"input": prepPreferencesInput(created.Version, 35, "2030-07-01"),
	}, owner)
	requireGraphCode(t, payload, "CONFLICT")
	assertGraphPrepPreferences(t, owner, &updated)

	_, payload = graphRequest(t, savePrepPreferencesMutation, map[string]any{
		"input": prepPreferencesInput(0, 35, "2030-07-01"),
	}, owner)
	requireGraphCode(t, payload, "CONFLICT")
	assertGraphPrepPreferences(t, owner, &updated)
}

func TestGraphQLPrepPreferencesRejectInvalidInput(t *testing.T) {
	owner := seedGraphSession(t, "-owner")
	tests := []map[string]any{
		prepPreferencesInput(-1, 42, "2028-02-29"),
		prepPreferencesInput(0, 0, "2028-02-29"),
		prepPreferencesInput(0, 61, "2028-02-29"),
		prepPreferencesInput(0, 42, "2027-02-29"),
		prepPreferencesInput(0, 42, "0000-01-01"),
	}
	for _, input := range tests {
		_, payload := graphRequest(t, savePrepPreferencesMutation, map[string]any{
			"input": input,
		}, owner)
		requireGraphCode(t, payload, "BAD_USER_INPUT")
	}
	assertGraphPrepPreferences(t, owner, nil)
}

func TestGraphQLPrepPreferencesRequireAuthentication(t *testing.T) {
	_, payload := graphRequest(t, prepPreferencesQuery, nil, nil)
	requireGraphCode(t, payload, "UNAUTHENTICATED")
	_, payload = graphRequest(t, savePrepPreferencesMutation, map[string]any{
		"input": prepPreferencesInput(0, 42, "2028-02-29"),
	}, nil)
	requireGraphCode(t, payload, "UNAUTHENTICATED")
}

func saveGraphPrepPreferences(
	t *testing.T,
	session *http.Cookie,
	expectedVersion int64,
	goalPoints int32,
	examDate string,
) prepPreferencesPayload {
	t.Helper()
	_, payload := graphRequest(t, savePrepPreferencesMutation, map[string]any{
		"input": prepPreferencesInput(expectedVersion, goalPoints, examDate),
	}, session)
	requireGraphSuccess(t, payload)
	var result struct {
		Preferences prepPreferencesPayload `json:"savePrepPreferences"`
	}
	if err := json.Unmarshal(payload.Data, &result); err != nil {
		t.Fatal(err)
	}
	return result.Preferences
}

func assertGraphPrepPreferences(
	t *testing.T,
	session *http.Cookie,
	want *prepPreferencesPayload,
) {
	t.Helper()
	_, payload := graphRequest(t, prepPreferencesQuery, nil, session)
	requireGraphSuccess(t, payload)
	var result struct {
		Preferences *prepPreferencesPayload `json:"prepPreferences"`
	}
	if err := json.Unmarshal(payload.Data, &result); err != nil {
		t.Fatal(err)
	}
	if want == nil {
		if result.Preferences != nil {
			t.Fatalf("unexpected preferences: %+v", result.Preferences)
		}
		return
	}
	if result.Preferences == nil ||
		result.Preferences.GoalPoints != want.GoalPoints ||
		result.Preferences.ExamDate != want.ExamDate ||
		result.Preferences.Version != want.Version ||
		result.Preferences.UpdatedAt.IsZero() {
		t.Fatalf("preferences = %+v, want %+v", result.Preferences, want)
	}
}

func prepPreferencesInput(version int64, goal int32, date string) map[string]any {
	return map[string]any{
		"expectedVersion": version,
		"goalPoints":      goal,
		"examDate":        date,
	}
}
