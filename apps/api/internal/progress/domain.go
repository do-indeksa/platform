package progress

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound          = errors.New("progress record not found")
	ErrConflict          = errors.New("progress write conflicts with existing data")
	ErrInvalidInput      = errors.New("invalid progress input")
	ErrInvalidTransition = errors.New("invalid run status transition")
)

type RunKind string

const (
	RunKindPractice   RunKind = "practice"
	RunKindDiagnostic RunKind = "diagnostic"
	RunKindSimulation RunKind = "simulation"
)

type RunStatus string

const (
	RunStatusActive    RunStatus = "active"
	RunStatusSubmitted RunStatus = "submitted"
	RunStatusAbandoned RunStatus = "abandoned"
)

const (
	P1TaskCount                      = 10
	MaxRunItems                      = 100
	MaxRunSummaries            int32 = 100
	MaxRecentRunItemAttempts   int32 = 20
	MaxAttemptJournalEntries   int32 = 1000
	MaxCompletedSimulationRuns int32 = 20
	MaxRunCheckpointDrafts     int32 = 100
)

type AttemptOutcome string

const (
	AttemptOutcomeCorrect   AttemptOutcome = "correct"
	AttemptOutcomeIncorrect AttemptOutcome = "incorrect"
	AttemptOutcomePartial   AttemptOutcome = "partial"
	AttemptOutcomeSkipped   AttemptOutcome = "skipped"
	AttemptOutcomeUngraded  AttemptOutcome = "ungraded"
)

type GradingKind string

const (
	GradingKindAuto       GradingKind = "auto"
	GradingKindRubricSelf GradingKind = "rubric_self"
	GradingKindAIAssisted GradingKind = "ai_assisted"
	GradingKindHuman      GradingKind = "human"
)

type RunAggregate struct {
	Run        Run
	Items      []RunItem
	Attempts   []Attempt
	Checkpoint *RunCheckpointAggregate
}

type RunCheckpointAggregate struct {
	Checkpoint RunCheckpoint
	Drafts     []RunCheckpointDraft
}

type StartRunInput struct {
	ID               uuid.UUID
	Kind             RunKind
	BlueprintVersion string
	ContentRevision  string
	StartedAt        time.Time
	DeadlineAt       *time.Time
	Items            []NewRunItem
}

type NewRunItem struct {
	ID              uuid.UUID
	TaskID          string
	ExamPosition    int16
	Topic           string
	MaxPoints       *int16
	AnswerPartCount *int16
	TaskRevision    string
}

type StandaloneAttemptTarget struct {
	TaskID       string
	ExamPosition int16
	TaskRevision string
	MaxPoints    *int16
}

type RecordAttemptInput struct {
	ID               uuid.UUID
	RunItemID        *uuid.UUID
	Standalone       *StandaloneAttemptTarget
	StartedAt        time.Time
	SubmittedAt      time.Time
	ActiveDurationMs *int64
	Answer           *string
	Outcome          AttemptOutcome
	HelpLevel        int16
	GradingKind      GradingKind
	EarnedPoints     *int16
}

type SubmitRunInput struct {
	ID               uuid.UUID
	SubmittedAt      time.Time
	ActiveDurationMs *int64
}

type CheckpointRunInput struct {
	ID               uuid.UUID
	ExpectedVersion  int64
	CurrentOrdinal   int16
	ActiveDurationMs *int64
	Drafts           []RunCheckpointDraftInput
}

type RunCheckpointDraftInput struct {
	RunItemID uuid.UUID
	Answer    string
}

type PrepPreferences struct {
	UserID     uuid.UUID
	GoalPoints int16
	ExamDate   time.Time
	Version    int64
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

type SavePrepPreferencesInput struct {
	ExpectedVersion int64
	GoalPoints      int16
	ExamDate        string
}

type AbandonRunInput struct {
	ID uuid.UUID
}
