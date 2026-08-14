package graph

import (
	"testing"

	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

func TestConfigureComplexityUsesProductBounds(t *testing.T) {
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
	assertComplexity(t, "run items", config.Complexity.Run.Items(1), progress.MaxRunItems)
	assertComplexity(
		t,
		"checkpoint drafts",
		config.Complexity.RunCheckpoint.Drafts(1),
		int(progress.MaxRunCheckpointDrafts),
	)
	assertComplexity(t, "summary task IDs", config.Complexity.RunSummary.TaskIds(1), progress.MaxRunItems)
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

func assertComplexity(t *testing.T, name string, actual, expected int) {
	t.Helper()
	if actual != expected {
		t.Fatalf("%s complexity = %d, want %d", name, actual, expected)
	}
}
