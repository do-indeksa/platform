package graph

import "github.com/do-indeksa/platform/apps/api/internal/progress"

const maxGraphQLComplexity = 32_000

const (
	runReadBaseComplexity = 1 + progress.MaxRunItems*(1+int(progress.MaxRecentRunItemAttempts)) +
		int(progress.MaxRunCheckpointDrafts)
	runSummaryReadBaseComplexity   = 1 + 2*progress.MaxRunItems
	completedRunReadBaseComplexity = 1 + 2*progress.P1TaskCount
	attemptReadBaseComplexity      = 1
)

func configureComplexity(config *Config) {
	config.Complexity.Query.Run = func(childComplexity int, _ string) int {
		return runReadBaseComplexity + childComplexity
	}
	config.Complexity.Query.Runs = func(childComplexity int, limit int32) int {
		return boundedListComplexity(
			childComplexity,
			limit,
			progress.MaxRunSummaries,
			runSummaryReadBaseComplexity,
		)
	}
	config.Complexity.Query.Attempts = func(childComplexity int, limit int32) int {
		return boundedListComplexity(
			childComplexity,
			limit,
			progress.MaxAttemptJournalEntries,
			attemptReadBaseComplexity,
		)
	}
	config.Complexity.Query.CompletedSimulationRuns = func(childComplexity int, limit int32) int {
		return boundedListComplexity(
			childComplexity,
			limit,
			progress.MaxCompletedSimulationRuns,
			completedRunReadBaseComplexity,
		)
	}
	config.Complexity.Run.Items = func(childComplexity int) int {
		return progress.MaxRunItems * childComplexity
	}
	config.Complexity.RunCheckpoint.Drafts = func(childComplexity int) int {
		return int(progress.MaxRunCheckpointDrafts) * childComplexity
	}
	config.Complexity.RunSummary.TaskIds = func(childComplexity int) int {
		return progress.MaxRunItems * childComplexity
	}
	config.Complexity.CompletedSimulationRun.Items = func(childComplexity int) int {
		return progress.P1TaskCount * childComplexity
	}
	config.Complexity.RunItem.RecentAttempts = func(childComplexity int, limit int32) int {
		return boundedListComplexity(
			childComplexity,
			limit,
			progress.MaxRecentRunItemAttempts,
			0,
		)
	}
}

func boundedListComplexity(childComplexity int, limit, maximum int32, baseComplexity int) int {
	if limit < 1 {
		return childComplexity
	}
	if limit > maximum {
		limit = maximum
	}
	return int(limit) * (baseComplexity + childComplexity)
}
