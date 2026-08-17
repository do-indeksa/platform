package graph

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestGraphQLAcceptsFirstPartyReadOperations(t *testing.T) {
	session := seedGraphSession(t, "-product-complexity")
	runVariables := map[string]any{"id": "00000000-0000-0000-0000-000000000001"}
	tests := []struct {
		name      string
		query     string
		variables map[string]any
	}{
		{name: "attempt journal", query: attemptJournalProductQuery, variables: map[string]any{"limit": 250}},
		{name: "diagnostic run index", query: diagnosticRunIndexProductQuery, variables: map[string]any{"limit": 100}},
		{name: "practice run index", query: practiceRunIndexProductQuery, variables: map[string]any{"limit": 100}},
		{name: "simulation run index", query: simulationRunIndexProductQuery, variables: map[string]any{"limit": 100}},
		{name: "diagnostic recovery", query: diagnosticCloudRunProductQuery, variables: runVariables},
		{name: "practice recovery", query: practiceCloudRunProductQuery, variables: runVariables},
		{name: "simulation recovery", query: simulationCloudRunProductQuery, variables: runVariables},
		{name: "run history", query: historyRunsProductQuery, variables: map[string]any{"limit": 100}},
		{name: "simulation archive", query: completedSimulationArchiveProductQuery, variables: map[string]any{"limit": 20}},
		{name: "preparation preferences", query: prepPreferencesProductQuery},
		{name: "training builder draft", query: trainingBuilderDraftProductQuery},
		{name: "maximum run projection", query: maximumRunProjectionQuery, variables: runVariables},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, payload := graphRequest(t, tt.query, tt.variables, session)
			requireGraphSuccess(t, payload)
		})
	}
}

func TestGraphQLRejectsAmplifiedReadsBeforeSessionLookup(t *testing.T) {
	session := seedGraphSession(t, "-amplified-complexity")
	runVariables := map[string]any{"id": "00000000-0000-0000-0000-000000000001"}
	tests := []struct {
		name      string
		query     string
		variables map[string]any
	}{
		{
			name: "duplicated maximum run",
			query: `query DuplicatedMaximumRun($id: ID!) {
				first: ` + maximumRunProjectionSelection + `
				second: ` + maximumRunProjectionSelection + `
			}`,
			variables: runVariables,
		},
		{
			name: "duplicated run history",
			query: `query DuplicatedHistory($limit: Int!) {
				first: ` + historyRunsSelection + `
				second: ` + historyRunsSelection + `
			}`,
			variables: map[string]any{"limit": 100},
		},
		{
			name: "repeated maximum run indexes",
			query: `query RepeatedRunIndexes {
				first: runs(limit: 100) { id }
				second: runs(limit: 100) { id }
			}`,
		},
		{
			name:  "thirty-three single-row reads",
			query: singleRowAliases(33),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			requireComplexityRejectionBeforeSessionLookup(t, tt.query, tt.variables, session)
		})
	}
}

func singleRowAliases(count int) string {
	aliases := make([]string, count)
	for index := range aliases {
		aliases[index] = fmt.Sprintf("p%d: prepPreferences { version }", index)
	}
	return "query SingleRowAliases {" + strings.Join(aliases, "\n") + "}"
}

func requireComplexityRejectionBeforeSessionLookup(
	t *testing.T,
	query string,
	variables map[string]any,
	session *http.Cookie,
) {
	t.Helper()
	before := graphTestPool.Stat().AcquireCount()

	response, payload := graphRequest(t, query, variables, session)

	if len(payload.Errors) == 0 ||
		!strings.Contains(strings.ToLower(payload.Errors[0].Message), "complexity") {
		t.Fatalf("over-budget operation was accepted: %+v", payload)
	}
	if cookies := response.Cookies(); len(cookies) != 0 {
		t.Fatalf("complexity rejection refreshed session cookie: %+v", cookies)
	}
	if after := graphTestPool.Stat().AcquireCount(); after != before {
		t.Fatalf("pool acquire count changed from %d to %d", before, after)
	}
}
