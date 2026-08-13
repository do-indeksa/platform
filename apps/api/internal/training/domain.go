package training

import (
	"errors"
	"time"
)

var (
	ErrNotFound     = errors.New("training builder draft not found")
	ErrConflict     = errors.New("training builder draft write conflict")
	ErrInvalidInput = errors.New("invalid training builder draft input")
)

const MaxBuilderTasks int32 = 10

type Difficulty string

const (
	DifficultyFoundation Difficulty = "foundation"
	DifficultyBalanced   Difficulty = "balanced"
	DifficultyAdvanced   Difficulty = "advanced"
)

type PositionQuantity struct {
	ExamPosition int32
	Quantity     int32
}

type BuilderDraft struct {
	BlueprintVersion   string
	Quantities         []PositionQuantity
	Difficulty         Difficulty
	OnlyNew            bool
	Shuffle            bool
	PrioritizeMistakes bool
	Version            int64
	UpdatedAt          time.Time
}

type SaveBuilderDraftInput struct {
	ExpectedVersion    int64
	BlueprintVersion   string
	Quantities         []PositionQuantity
	Difficulty         Difficulty
	OnlyNew            bool
	Shuffle            bool
	PrioritizeMistakes bool
}
