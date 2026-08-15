package graph

import (
	"encoding/json"
	"net/http"
	"testing"
)

const prepPreferencesQuery = `
  query PrepPreferences {
    prepPreferences { goalPoints examDate version updatedAt }
  }
`

const savePrepPreferencesMutation = `
  mutation SavePrepPreferences($input: SavePrepPreferencesInput!) {
    savePrepPreferences(input: $input) {
      goalPoints
      examDate
      version
      updatedAt
    }
  }
`

type prepPreferencesPayload struct {
	GoalPoints int32  `json:"goalPoints"`
	ExamDate   string `json:"examDate"`
	Version    int64  `json:"version"`
	UpdatedAt  string `json:"updatedAt"`
}

func TestPrepPreferencesGraphQLIsNullableOwnerScopedAndVersioned(t *testing.T) {
	owner := seedGraphSession(t, "-prep-owner")
	other := seedGraphSession(t, "-prep-other")

	_, anonymous := graphRequest(t, prepPreferencesQuery, nil, nil)
	requireGraphCode(t, anonymous, "UNAUTHENTICATED")

	_, empty := graphRequest(t, prepPreferencesQuery, nil, owner)
	requireGraphSuccess(t, empty)
	var emptyData struct {
		Preferences *prepPreferencesPayload `json:"prepPreferences"`
	}
	if err := json.Unmarshal(empty.Data, &emptyData); err != nil {
		t.Fatal(err)
	}
	if emptyData.Preferences != nil {
		t.Fatalf("empty preferences: %+v", emptyData.Preferences)
	}

	created := saveGraphPrepPreferences(t, owner, 0, 42, "2027-06-28")
	if created.GoalPoints != 42 || created.ExamDate != "2027-06-28" ||
		created.Version != 1 || created.UpdatedAt == "" {
		t.Fatalf("created preferences: %+v", created)
	}

	_, otherPayload := graphRequest(t, prepPreferencesQuery, nil, other)
	requireGraphSuccess(t, otherPayload)
	var otherData struct {
		Preferences *prepPreferencesPayload `json:"prepPreferences"`
	}
	if err := json.Unmarshal(otherPayload.Data, &otherData); err != nil {
		t.Fatal(err)
	}
	if otherData.Preferences != nil {
		t.Fatalf("other owner saw preferences: %+v", otherData.Preferences)
	}

	updated := saveGraphPrepPreferences(t, owner, 1, 50, "2028-07-01")
	if updated.GoalPoints != 50 || updated.ExamDate != "2028-07-01" || updated.Version != 2 {
		t.Fatalf("updated preferences: %+v", updated)
	}
	_, stale := graphRequest(t, savePrepPreferencesMutation, map[string]any{
		"input": map[string]any{
			"expectedVersion": int64(1),
			"goalPoints":      35,
			"examDate":        "2029-08-02",
		},
	}, owner)
	requireGraphCode(t, stale, "CONFLICT")

	_, loadedPayload := graphRequest(t, prepPreferencesQuery, nil, owner)
	requireGraphSuccess(t, loadedPayload)
	var loadedData struct {
		Preferences *prepPreferencesPayload `json:"prepPreferences"`
	}
	if err := json.Unmarshal(loadedPayload.Data, &loadedData); err != nil {
		t.Fatal(err)
	}
	if loadedData.Preferences == nil || *loadedData.Preferences != updated {
		t.Fatalf("loaded preferences: %+v, want %+v", loadedData.Preferences, updated)
	}
}

func TestPrepPreferencesGraphQLRejectsInvalidAndAnonymousWrites(t *testing.T) {
	owner := seedGraphSession(t, "-prep-invalid")
	input := map[string]any{
		"input": map[string]any{
			"expectedVersion": int64(0),
			"goalPoints":      42,
			"examDate":        "2027-02-30",
		},
	}
	_, invalid := graphRequest(t, savePrepPreferencesMutation, input, owner)
	requireGraphCode(t, invalid, "BAD_USER_INPUT")
	_, anonymous := graphRequest(t, savePrepPreferencesMutation, input, nil)
	requireGraphCode(t, anonymous, "UNAUTHENTICATED")
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
		"input": map[string]any{
			"expectedVersion": expectedVersion,
			"goalPoints":      goalPoints,
			"examDate":        examDate,
		},
	}, session)
	requireGraphSuccess(t, payload)
	var data struct {
		Preferences prepPreferencesPayload `json:"savePrepPreferences"`
	}
	if err := json.Unmarshal(payload.Data, &data); err != nil {
		t.Fatal(err)
	}
	return data.Preferences
}
