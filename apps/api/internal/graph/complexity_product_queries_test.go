package graph

const attemptJournalProductQuery = `
	query AttemptJournal($limit: Int!) {
		attempts(limit: $limit) {
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

const diagnosticRunIndexProductQuery = `
	query DiagnosticRunIndex($limit: Int!) {
		runs(limit: $limit) { id kind status startedAt }
	}
`

const practiceRunIndexProductQuery = `
	query PracticeRunIndex($limit: Int!) {
		runs(limit: $limit) { id kind status startedAt }
	}
`

const simulationRunIndexProductQuery = `
	query SimulationRunIndex($limit: Int!) {
		runs(limit: $limit) { id kind status startedAt }
	}
`

const diagnosticCloudRunProductQuery = `
	query DiagnosticCloudRun($id: ID!) {
		run(id: $id) {
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
				recentAttempts(limit: 2) {
					id
					runItemId
					taskId
					examPosition
					mode
					startedAt
					submittedAt
					answer
					outcome
					helpLevel
					gradingKind
					taskRevision
				}
			}
		}
	}
`

const practiceCloudRunProductQuery = `
	query PracticeCloudRun($id: ID!) {
		run(id: $id) {
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
	}
`

const simulationCloudRunProductQuery = `
	query SimulationCloudRun($id: ID!) {
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
				maxPoints
				answerPartCount
				taskRevision
				recentAttempts(limit: 2) {
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

const historyRunsSelection = `runs(limit: $limit) {
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
		}`

const historyRunsProductQuery = `
	query HistoryRuns($limit: Int!) {
		` + historyRunsSelection + `
		latestSubmittedDiagnosticRun { id submittedAt }
	}
`

const completedSimulationArchiveProductQuery = `
	query CompletedSimulationArchive($limit: Int!) {
		completedSimulationRuns(limit: $limit) {
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
				answerPartCount
				taskRevision
				answer
				outcome
				gradingKind
				earnedPoints
			}
		}
	}
`

const prepPreferencesProductQuery = `
	query PrepPreferences {
		prepPreferences { goalPoints examDate version updatedAt }
	}
`

const trainingBuilderDraftProductQuery = `
	query TrainingBuilderDraft {
		trainingBuilderDraft {
			blueprintVersion
			quantities { examPosition quantity }
			difficulty
			onlyNew
			shuffle
			prioritizeMistakes
			version
		}
	}
`

const maximumRunProjectionSelection = `run(id: $id) {
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
				maxPoints
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
					earnedPoints
					maxPoints
					taskRevision
				}
			}
		}`

const maximumRunProjectionQuery = `
	query MaximumRunProjection($id: ID!) {
		` + maximumRunProjectionSelection + `
	}
`
