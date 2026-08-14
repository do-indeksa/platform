package graph

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

const attemptJournalProductQuery = `
	query AttemptJournal {
		attempts(limit: 250) {
			id
			runItemId
			taskId
			examPosition
			mode
			startedAt
			submittedAt
			activeDurationMs
			answer
			outcome
			helpLevel
			gradingKind
			earnedPoints
			maxPoints
			taskRevision
		}
	}
`

const practiceRunSelection = `run(id: $id) {
			id
			kind
			status
			blueprintVersion
			contentRevision
			startedAt
			checkpoint {
				version
				currentOrdinal
				activeDurationMs
				updatedAt
				drafts { runItemId answer }
			}
			items {
				id
				taskId
				ordinal
				examPosition
				topic
				answerPartCount
				taskRevision
				recentAttempts(limit: 20) {
					id
					runItemId
					taskId
					examPosition
					mode
					startedAt
					submittedAt
					activeDurationMs
					answer
					outcome
					helpLevel
					gradingKind
					taskRevision
				}
			}
		}
	`

const practiceRunProductQuery = `
	query PracticeCloudRun($id: ID!) {
		` + practiceRunSelection + `
	}
`

const maximumRunProjectionQuery = `
	query MaximumRunProjection($id: ID!) {
		run(id: $id) {
			id
			kind
			status
			blueprintVersion
			contentRevision
			startedAt
			deadlineAt
			submittedAt
			activeDurationMs
			checkpoint {
				version
				currentOrdinal
				activeDurationMs
				updatedAt
				drafts { runItemId answer }
			}
			items {
				id
				taskId
				ordinal
				examPosition
				topic
				answerPartCount
				maxPoints
				taskRevision
				recentAttempts(limit: 20) {
					id
					runItemId
					taskId
					examPosition
					mode
					startedAt
					submittedAt
					activeDurationMs
					answer
					outcome
					helpLevel
					gradingKind
					earnedPoints
					maxPoints
					taskRevision
				}
			}
		}
	}
`

const historyRunsSelection = `
	runs(limit: 100) {
		id
		kind
		status
		blueprintVersion
		contentRevision
		startedAt
		submittedAt
		activeDurationMs
		taskIds
		itemCount
		completedItemCount
		correctItemCount
		earnedPoints
		maxPoints
	}
`

const historyRunsProductQuery = `
	query HistoryRuns {
		` + historyRunsSelection + `
		latestSubmittedDiagnostic: latestSubmittedRun(kind: DIAGNOSTIC) {
			id
			kind
			submittedAt
		}
	}
`

const completedSimulationArchiveProductQuery = `
	query SimulationArchive {
		completedSimulationRuns(limit: 20) {
			id
			blueprintVersion
			contentRevision
			startedAt
			deadlineAt
			submittedAt
			activeDurationMs
			items {
				taskId
				examPosition
				topic
				maxPoints
				taskRevision
				answer
				outcome
				earnedPoints
			}
		}
	}
`

func TestGraphQLAcceptsBoundedProductOperations(t *testing.T) {
	session := seedGraphSession(t, "-product-complexity")
	tests := []struct {
		name      string
		query     string
		variables map[string]any
	}{
		{name: "attempt journal", query: attemptJournalProductQuery},
		{
			name:      "practice recovery",
			query:     practiceRunProductQuery,
			variables: map[string]any{"id": "00000000-0000-0000-0000-000000000001"},
		},
		{
			name:      "maximum run projection",
			query:     maximumRunProjectionQuery,
			variables: map[string]any{"id": "00000000-0000-0000-0000-000000000001"},
		},
		{name: "run history", query: historyRunsProductQuery},
		{name: "completed simulation archive", query: completedSimulationArchiveProductQuery},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, payload := graphRequest(t, tt.query, tt.variables, session)
			requireGraphSuccess(t, payload)
		})
	}
}

func TestGraphQLRejectsDuplicatedMaximumHistoryBeforeSessionLookup(t *testing.T) {
	session := seedGraphSession(t, "-duplicated-history")
	query := `query DuplicatedHistory {
		first: ` + historyRunsSelection + `
		second: ` + historyRunsSelection + `
	}`
	requireComplexityRejectionBeforeSessionLookup(t, query, nil, session)
}

func TestGraphQLRejectsDuplicatedMaximumPracticeRecoveryBeforeSessionLookup(t *testing.T) {
	session := seedGraphSession(t, "-duplicated-practice-recovery")
	query := `query DuplicatedPracticeRecovery($id: ID!) {
		first: ` + practiceRunSelection + `
		second: ` + practiceRunSelection + `
	}`
	requireComplexityRejectionBeforeSessionLookup(
		t,
		query,
		map[string]any{"id": "00000000-0000-0000-0000-000000000001"},
		session,
	)
}

func TestGraphQLRejectsThirtyThreeSingleRowReadsBeforeSessionLookup(t *testing.T) {
	session := seedGraphSession(t, "-thirty-three-root-reads")
	aliases := make([]string, 33)
	for index := range aliases {
		aliases[index] = fmt.Sprintf("p%d: prepPreferences { version }", index)
	}
	requireComplexityRejectionBeforeSessionLookup(
		t,
		"query TooManyRootReads {"+strings.Join(aliases, "\n")+"}",
		nil,
		session,
	)
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

	if len(payload.Errors) == 0 || !strings.Contains(strings.ToLower(payload.Errors[0].Message), "complexity") {
		t.Fatalf("over-budget operation was accepted: %+v", payload)
	}
	if cookies := response.Cookies(); len(cookies) != 0 {
		t.Fatalf("complexity rejection refreshed session cookie: %+v", cookies)
	}
	if after := graphTestPool.Stat().AcquireCount(); after != before {
		t.Fatalf("pool acquire count changed from %d to %d", before, after)
	}
}
