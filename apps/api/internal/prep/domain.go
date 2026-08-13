package prep

import (
	"errors"
	"time"
)

var (
	ErrNotFound     = errors.New("preparation preferences not found")
	ErrConflict     = errors.New("preparation preferences write conflict")
	ErrInvalidInput = errors.New("invalid preparation preferences input")
)

const (
	MinGoalPoints      int32 = 1
	MaxGoalPoints      int32 = 60
	calendarDateLayout       = "2006-01-02"
)

type Preferences struct {
	GoalPoints int32
	ExamDate   string
	Version    int64
	UpdatedAt  time.Time
}

type SaveInput struct {
	ExpectedVersion int64
	GoalPoints      int32
	ExamDate        string
}
