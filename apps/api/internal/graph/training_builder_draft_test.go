package graph

import (
	"encoding/json"
	"net/http"
	"reflect"
	"testing"
	"time"
)

const trainingBuilderDraftQuery = `query TrainingBuilderDraft {
	trainingBuilderDraft {
		blueprintVersion
		quantities { examPosition quantity }
		difficulty
		onlyNew
		shuffle
		prioritizeMistakes
		version
		updatedAt
	}
}`

const saveTrainingBuilderDraftMutation = `mutation SaveTrainingBuilderDraft(
	$input: SaveTrainingBuilderDraftInput!
) {
	saveTrainingBuilderDraft(input: $input) {
		blueprintVersion
		quantities { examPosition quantity }
		difficulty
		onlyNew
		shuffle
		prioritizeMistakes
		version
		updatedAt
	}
}`

type trainingBuilderQuantityPayload struct {
	ExamPosition int32 `json:"examPosition"`
	Quantity     int32 `json:"quantity"`
}

type trainingBuilderDraftPayload struct {
	BlueprintVersion   string                           `json:"blueprintVersion"`
	Quantities         []trainingBuilderQuantityPayload `json:"quantities"`
	Difficulty         string                           `json:"difficulty"`
	OnlyNew            bool                             `json:"onlyNew"`
	Shuffle            bool                             `json:"shuffle"`
	PrioritizeMistakes bool                             `json:"prioritizeMistakes"`
	Version            int64                            `json:"version"`
	UpdatedAt          time.Time                        `json:"updatedAt"`
}

func TestGraphQLTrainingBuilderDraftIsOwnerScopedAndVersioned(t *testing.T) {
	owner := seedGraphSession(t, "-training-owner")
	other := seedGraphSession(t, "-training-other")

	assertGraphTrainingBuilderDraft(t, owner, nil)
	assertGraphTrainingBuilderDraft(t, other, nil)

	created := saveGraphTrainingBuilderDraft(t, owner, trainingBuilderDraftInput(
		0,
		"2026.1",
		[]map[string]any{
			{"examPosition": 10, "quantity": 1},
			{"examPosition": 1, "quantity": 3},
			{"examPosition": 4, "quantity": 2},
		},
		"BALANCED",
		true,
		true,
		false,
	))
	wantCreatedQuantities := []trainingBuilderQuantityPayload{
		{ExamPosition: 1, Quantity: 3},
		{ExamPosition: 4, Quantity: 2},
		{ExamPosition: 10, Quantity: 1},
	}
	if created.Version != 1 || created.BlueprintVersion != "2026.1" ||
		created.Difficulty != "BALANCED" || !created.OnlyNew || !created.Shuffle ||
		created.PrioritizeMistakes || created.UpdatedAt.IsZero() ||
		!reflect.DeepEqual(created.Quantities, wantCreatedQuantities) {
		t.Fatalf("created draft = %+v", created)
	}
	assertGraphTrainingBuilderDraft(t, owner, &created)
	assertGraphTrainingBuilderDraft(t, other, nil)

	updated := saveGraphTrainingBuilderDraft(t, owner, trainingBuilderDraftInput(
		created.Version,
		"2026.1",
		[]map[string]any{{"examPosition": 2, "quantity": 4}},
		"ADVANCED",
		false,
		false,
		true,
	))
	if updated.Version != 2 || updated.Difficulty != "ADVANCED" ||
		updated.OnlyNew || updated.Shuffle || !updated.PrioritizeMistakes ||
		!reflect.DeepEqual(updated.Quantities, []trainingBuilderQuantityPayload{
			{ExamPosition: 2, Quantity: 4},
		}) {
		t.Fatalf("updated draft = %+v", updated)
	}

	for _, staleVersion := range []int64{created.Version, 0} {
		_, payload := graphRequest(t, saveTrainingBuilderDraftMutation, map[string]any{
			"input": trainingBuilderDraftInput(
				staleVersion,
				"2026.1",
				[]map[string]any{{"examPosition": 3, "quantity": 5}},
				"FOUNDATION",
				true,
				true,
				false,
			),
		}, owner)
		requireGraphCode(t, payload, "CONFLICT")
	}
	assertGraphTrainingBuilderDraft(t, owner, &updated)
}

func TestGraphQLTrainingBuilderDraftRejectsInvalidInput(t *testing.T) {
	owner := seedGraphSession(t, "-training-invalid")
	tests := []map[string]any{
		trainingBuilderDraftInput(-1, "2026.1", nil, "BALANCED", false, true, false),
		trainingBuilderDraftInput(0, "ftn-p1:2026.1", nil, "BALANCED", false, true, false),
		trainingBuilderDraftInput(0, "2026.1", []map[string]any{
			{"examPosition": 1, "quantity": 1},
			{"examPosition": 1, "quantity": 2},
		}, "BALANCED", false, true, false),
		trainingBuilderDraftInput(0, "2026.1", []map[string]any{
			{"examPosition": 0, "quantity": 1},
		}, "BALANCED", false, true, false),
		trainingBuilderDraftInput(0, "2026.1", []map[string]any{
			{"examPosition": 11, "quantity": 1},
		}, "BALANCED", false, true, false),
		trainingBuilderDraftInput(0, "2026.1", []map[string]any{
			{"examPosition": 1, "quantity": 0},
		}, "BALANCED", false, true, false),
		trainingBuilderDraftInput(0, "2026.1", []map[string]any{
			{"examPosition": 1, "quantity": 11},
		}, "BALANCED", false, true, false),
		trainingBuilderDraftInput(0, "2026.1", []map[string]any{
			{"examPosition": 1, "quantity": 6},
			{"examPosition": 2, "quantity": 5},
		}, "BALANCED", false, true, false),
	}
	for _, input := range tests {
		_, payload := graphRequest(t, saveTrainingBuilderDraftMutation, map[string]any{
			"input": input,
		}, owner)
		requireGraphCode(t, payload, "BAD_USER_INPUT")
	}
	assertGraphTrainingBuilderDraft(t, owner, nil)
}

func TestGraphQLTrainingBuilderDraftRequiresAuthentication(t *testing.T) {
	_, payload := graphRequest(t, trainingBuilderDraftQuery, nil, nil)
	requireGraphCode(t, payload, "UNAUTHENTICATED")

	_, payload = graphRequest(t, saveTrainingBuilderDraftMutation, map[string]any{
		"input": trainingBuilderDraftInput(
			0,
			"2026.1",
			nil,
			"BALANCED",
			false,
			true,
			false,
		),
	}, nil)
	requireGraphCode(t, payload, "UNAUTHENTICATED")
}

func saveGraphTrainingBuilderDraft(
	t *testing.T,
	session *http.Cookie,
	input map[string]any,
) trainingBuilderDraftPayload {
	t.Helper()
	_, payload := graphRequest(t, saveTrainingBuilderDraftMutation, map[string]any{
		"input": input,
	}, session)
	requireGraphSuccess(t, payload)
	var result struct {
		Draft trainingBuilderDraftPayload `json:"saveTrainingBuilderDraft"`
	}
	if err := json.Unmarshal(payload.Data, &result); err != nil {
		t.Fatal(err)
	}
	return result.Draft
}

func assertGraphTrainingBuilderDraft(
	t *testing.T,
	session *http.Cookie,
	want *trainingBuilderDraftPayload,
) {
	t.Helper()
	_, payload := graphRequest(t, trainingBuilderDraftQuery, nil, session)
	requireGraphSuccess(t, payload)
	var result struct {
		Draft *trainingBuilderDraftPayload `json:"trainingBuilderDraft"`
	}
	if err := json.Unmarshal(payload.Data, &result); err != nil {
		t.Fatal(err)
	}
	if want == nil {
		if result.Draft != nil {
			t.Fatalf("unexpected training builder draft: %+v", result.Draft)
		}
		return
	}
	if result.Draft == nil ||
		result.Draft.BlueprintVersion != want.BlueprintVersion ||
		result.Draft.Difficulty != want.Difficulty ||
		result.Draft.OnlyNew != want.OnlyNew ||
		result.Draft.Shuffle != want.Shuffle ||
		result.Draft.PrioritizeMistakes != want.PrioritizeMistakes ||
		result.Draft.Version != want.Version || result.Draft.UpdatedAt.IsZero() ||
		!reflect.DeepEqual(result.Draft.Quantities, want.Quantities) {
		t.Fatalf("training builder draft = %+v, want %+v", result.Draft, want)
	}
}

func trainingBuilderDraftInput(
	expectedVersion int64,
	blueprintVersion string,
	quantities []map[string]any,
	difficulty string,
	onlyNew bool,
	shuffle bool,
	prioritizeMistakes bool,
) map[string]any {
	if quantities == nil {
		quantities = []map[string]any{}
	}
	return map[string]any{
		"expectedVersion":    expectedVersion,
		"blueprintVersion":   blueprintVersion,
		"quantities":         quantities,
		"difficulty":         difficulty,
		"onlyNew":            onlyNew,
		"shuffle":            shuffle,
		"prioritizeMistakes": prioritizeMistakes,
	}
}
