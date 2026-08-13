package graph

import (
	"net/http"
	"testing"
)

func TestGraphQLRejectsMultipleMutationCommandsBeforeWriting(t *testing.T) {
	session := seedGraphTransportSession(t, "-multiple-mutation-commands")
	mutation := `mutation MultipleCommands($first: SavePrepPreferencesInput!, $second: SavePrepPreferencesInput!) {
		first: savePrepPreferences(input: $first) { version }
		second: savePrepPreferences(input: $second) { version }
	}`
	response, payload := graphRequest(t, mutation, map[string]any{
		"first":  prepPreferencesInput(0, 42, "2028-02-29"),
		"second": prepPreferencesInput(0, 55, "2029-06-28"),
	}, session)

	if response.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusUnprocessableEntity)
	}
	requireSingleCommandMutationError(t, payload)
	assertGraphPrepPreferences(t, session, nil)
}

func TestGraphQLCountsConditionalFragmentMutationCommandsPerRequest(t *testing.T) {
	mutation := `mutation ConditionalCommands(
		$firstEnabled: Boolean!
		$secondSkipped: Boolean!
		$first: SavePrepPreferencesInput!
		$second: SavePrepPreferencesInput!
	) {
		...FirstCommand @include(if: $firstEnabled)
		... on Mutation @skip(if: $secondSkipped) {
			second: savePrepPreferences(input: $second) { version }
		}
	}
	fragment FirstCommand on Mutation {
		first: savePrepPreferences(input: $first) { version }
	}`
	variables := func(firstEnabled, secondSkipped bool) map[string]any {
		return map[string]any{
			"firstEnabled":  firstEnabled,
			"secondSkipped": secondSkipped,
			"first":         prepPreferencesInput(0, 42, "2028-02-29"),
			"second":        prepPreferencesInput(0, 55, "2029-06-28"),
		}
	}

	t.Run("one command", func(t *testing.T) {
		session := seedGraphTransportSession(t, "-one-conditional-command")
		response, payload := graphRequest(t, mutation, variables(true, true), session)
		if response.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
		}
		requireGraphSuccess(t, payload)
		assertGraphPrepPreferences(t, session, &prepPreferencesPayload{
			GoalPoints: 42,
			ExamDate:   "2028-02-29",
			Version:    1,
		})
	})

	t.Run("zero commands", func(t *testing.T) {
		session := seedGraphTransportSession(t, "-zero-conditional-commands")
		response, payload := graphRequest(t, mutation, variables(false, true), session)
		if response.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
		}
		requireGraphSuccess(t, payload)
		assertGraphPrepPreferences(t, session, nil)
	})

	t.Run("second command", func(t *testing.T) {
		session := seedGraphTransportSession(t, "-second-conditional-command")
		response, payload := graphRequest(t, mutation, variables(false, false), session)
		if response.StatusCode != http.StatusOK {
			t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
		}
		requireGraphSuccess(t, payload)
		assertGraphPrepPreferences(t, session, &prepPreferencesPayload{
			GoalPoints: 55,
			ExamDate:   "2029-06-28",
			Version:    1,
		})
	})

	t.Run("two commands", func(t *testing.T) {
		session := seedGraphTransportSession(t, "-two-conditional-commands")
		response, payload := graphRequest(t, mutation, variables(true, false), session)
		if response.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusUnprocessableEntity)
		}
		requireSingleCommandMutationError(t, payload)
		assertGraphPrepPreferences(t, session, nil)
	})
}

func TestGraphQLQueriesKeepMultipleTopLevelFields(t *testing.T) {
	session := seedGraphTransportSession(t, "-multi-field-query")
	response, payload := graphRequest(t, `query MultiFieldQuery {
		prepPreferences { version }
		runs(limit: 1) { id }
	}`, nil, session)

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	requireGraphSuccess(t, payload)
}

func requireSingleCommandMutationError(t *testing.T, payload graphResponse) {
	t.Helper()
	if len(payload.Errors) != 1 ||
		payload.Errors[0].Message != "mutation must contain at most one top-level command" ||
		payload.Errors[0].Extensions["code"] != "GRAPHQL_VALIDATION_FAILED" {
		t.Fatalf("unexpected mutation command errors: %+v", payload.Errors)
	}
}
