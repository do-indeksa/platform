package graph

import (
	"testing"

	"github.com/99designs/gqlgen/complexity"
	"github.com/vektah/gqlparser/v2"
	"github.com/vektah/gqlparser/v2/validator/rules"

	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/training"
)

func TestConfigureComplexityUsesServerBounds(t *testing.T) {
	config := Config{}
	configureComplexity(&config)

	assertComplexity(t, "run read", config.Complexity.Query.Run(1, "run-id"), runReadBaseComplexity+1)
	assertComplexity(
		t,
		"run summaries",
		config.Complexity.Query.Runs(1, progress.MaxRunSummaries),
		int(progress.MaxRunSummaries)*(runSummaryReadBaseComplexity+1),
	)
	assertComplexity(
		t,
		"attempt journal",
		config.Complexity.Query.Attempts(1, progress.MaxAttemptJournalEntries),
		int(progress.MaxAttemptJournalEntries)*(attemptReadBaseComplexity+1),
	)
	assertComplexity(
		t,
		"completed simulations",
		config.Complexity.Query.CompletedSimulationRuns(1, progress.MaxCompletedSimulationRuns),
		int(progress.MaxCompletedSimulationRuns)*(completedRunReadBaseComplexity+1),
	)
	assertComplexity(
		t,
		"latest diagnostic",
		config.Complexity.Query.LatestSubmittedDiagnosticRun(1),
		singleRowReadBaseComplexity+1,
	)
	assertComplexity(t, "preparation preferences", config.Complexity.Query.PrepPreferences(1), 1_025)
	assertComplexity(t, "training draft", config.Complexity.Query.TrainingBuilderDraft(1), 1_025)
	assertComplexity(t, "run items", config.Complexity.Run.Items(1), progress.MaxRunItems)
	assertComplexity(
		t,
		"checkpoint drafts",
		config.Complexity.RunCheckpoint.Drafts(1),
		int(progress.MaxRunCheckpointDrafts),
	)
	assertComplexity(t, "summary task IDs", config.Complexity.RunSummary.TaskIds(0), progress.MaxRunItems)
	assertComplexity(
		t,
		"completed simulation items",
		config.Complexity.CompletedSimulationRun.Items(1),
		progress.P1TaskCount,
	)
	assertComplexity(
		t,
		"recent attempts",
		config.Complexity.RunItem.RecentAttempts(1, progress.MaxRecentRunItemAttempts),
		int(progress.MaxRecentRunItemAttempts),
	)
	assertComplexity(
		t,
		"training quantities",
		config.Complexity.TrainingBuilderDraft.Quantities(1),
		int(training.MaxBuilderTasks),
	)
}

func TestGraphQLComplexityBudgetCalibration(t *testing.T) {
	runVariables := map[string]any{"id": "00000000-0000-0000-0000-000000000001"}
	tests := []struct {
		name       string
		query      string
		variables  map[string]any
		complexity int
	}{
		{name: "attempt journal", query: attemptJournalProductQuery, variables: map[string]any{"limit": 250}, complexity: 4_000},
		{name: "diagnostic run index", query: diagnosticRunIndexProductQuery, variables: map[string]any{"limit": 100}, complexity: 20_500},
		{name: "practice run index", query: practiceRunIndexProductQuery, variables: map[string]any{"limit": 100}, complexity: 20_500},
		{name: "simulation run index", query: simulationRunIndexProductQuery, variables: map[string]any{"limit": 100}, complexity: 20_500},
		{name: "diagnostic recovery", query: diagnosticCloudRunProductQuery, variables: runVariables, complexity: 5_512},
		{name: "practice recovery", query: practiceCloudRunProductQuery, variables: runVariables, complexity: 29_112},
		{name: "simulation recovery", query: simulationCloudRunProductQuery, variables: runVariables, complexity: 6_215},
		{name: "run history", query: historyRunsProductQuery, variables: map[string]any{"limit": 100}, complexity: 32_426},
		{name: "simulation archive", query: completedSimulationArchiveProductQuery, variables: map[string]any{"limit": 20}, complexity: 2_560},
		{name: "preparation preferences", query: prepPreferencesProductQuery, complexity: 1_028},
		{name: "training builder draft", query: trainingBuilderDraftProductQuery, complexity: 1_050},
		{name: "maximum run projection", query: maximumRunProjectionQuery, variables: runVariables, complexity: 33_215},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			actual := operationComplexity(t, tt.query, tt.variables)
			assertComplexity(t, tt.name, actual, tt.complexity)
			if actual > maxGraphQLComplexity {
				t.Fatalf("%s complexity %d exceeds budget %d", tt.name, actual, maxGraphQLComplexity)
			}
		})
	}

	if 2*operationComplexity(t, maximumRunProjectionQuery, runVariables) <= maxGraphQLComplexity {
		t.Fatal("duplicated maximum run projection fits the GraphQL budget")
	}
	if 2*operationComplexity(t, historyRunsProductQuery, map[string]any{"limit": 100}) <= maxGraphQLComplexity {
		t.Fatal("duplicated run history fits the GraphQL budget")
	}
	if 32*(singleRowReadBaseComplexity+1) > maxGraphQLComplexity {
		t.Fatal("32 minimal single-row reads exceed the GraphQL budget")
	}
	if 33*(singleRowReadBaseComplexity+1) <= maxGraphQLComplexity {
		t.Fatal("33 minimal single-row reads fit the GraphQL budget")
	}
}

func TestBoundedListComplexityPreservesValidationAndClampsAccounting(t *testing.T) {
	const (
		child   = 7
		base    = 3
		maximum = int32(20)
	)

	assertComplexity(t, "invalid limit", boundedListComplexity(child, 0, maximum, base), child)
	assertComplexity(
		t,
		"declared maximum",
		boundedListComplexity(child, maximum, maximum, base),
		int(maximum)*(base+child),
	)
	assertComplexity(
		t,
		"over-limit accounting",
		boundedListComplexity(child, maximum+1, maximum, base),
		int(maximum)*(base+child),
	)
}

func operationComplexity(t *testing.T, query string, variables map[string]any) int {
	t.Helper()
	config := Config{}
	configureComplexity(&config)
	schema := NewExecutableSchema(config)
	document, queryErrors := gqlparser.LoadQueryWithRules(
		schema.Schema(),
		query,
		rules.NewDefaultRules(),
	)
	if len(queryErrors) != 0 {
		t.Fatalf("parse operation: %+v", queryErrors)
	}
	return complexity.Calculate(t.Context(), schema, document.Operations[0], variables)
}

func assertComplexity(t *testing.T, name string, actual, expected int) {
	t.Helper()
	if actual != expected {
		t.Fatalf("%s complexity = %d, want %d", name, actual, expected)
	}
}
