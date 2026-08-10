package progress

import (
	"errors"
	"time"

	"github.com/google/uuid"
)

var (
	ErrNotFound          = errors.New("progress record not found")
	ErrConflict          = errors.New("client id is already used by different data")
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
	Run      Run
	Items    []RunItem
	Attempts []Attempt
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
	ID           uuid.UUID
	TaskID       string
	ExamPosition int16
	Topic        string
	MaxPoints    *int16
	TaskRevision string
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
