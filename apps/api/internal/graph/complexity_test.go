package graph

import (
	"testing"

	"github.com/do-indeksa/platform/apps/api/internal/graph/model"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/training"
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
	if config.Complexity.Query.LatestSubmittedRun == nil {
		t.Fatal("latest submitted run complexity is not configured")
	}
	assertComplexity(
		t,
		"latest submitted run",
		config.Complexity.Query.LatestSubmittedRun(1, model.RunKindDiagnostic),
		1_025,
	)
	if config.Complexity.Query.PrepPreferences == nil {
		t.Fatal("prep preferences complexity is not configured")
	}
	assertComplexity(t, "prep preferences", config.Complexity.Query.PrepPreferences(1), 1_025)
	if config.Complexity.Query.TrainingBuilderDraft == nil {
		t.Fatal("training builder draft complexity is not configured")
	}
	assertComplexity(t, "training builder draft", config.Complexity.Query.TrainingBuilderDraft(1), 1_025)
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
	if config.Complexity.TrainingBuilderDraft.Quantities == nil {
		t.Fatal("training quantities complexity is not configured")
	}
	assertComplexity(
		t,
		"training quantities",
		config.Complexity.TrainingBuilderDraft.Quantities(1),
		int(training.MaxBuilderTasks),
	)

	const minimalSingleRowRead = 1_025
	if 32*minimalSingleRowRead > maxGraphQLComplexity {
		t.Fatalf("32 single-row reads exceed complexity budget %d", maxGraphQLComplexity)
	}
	if 33*minimalSingleRowRead <= maxGraphQLComplexity {
		t.Fatalf("33 single-row reads fit complexity budget %d", maxGraphQLComplexity)
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

func assertComplexity(t *testing.T, name string, actual, expected int) {
	t.Helper()
	if actual != expected {
		t.Fatalf("%s complexity = %d, want %d", name, actual, expected)
	}
}
