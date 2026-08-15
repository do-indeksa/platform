package progress

import (
	"context"
	"fmt"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

type practiceAttemptTransition struct {
	runID     uuid.UUID
	runItemID uuid.UUID
}

func practiceAttemptID(runItemID uuid.UUID, number int) uuid.UUID {
	return uuid.NewSHA1(runItemID, []byte(fmt.Sprintf("attempt:%d", number)))
}

func validateSnapshottedPracticeAttempt(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	input RecordAttemptInput,
	target attemptTarget,
	hasExisting bool,
) (*practiceAttemptTransition, error) {
	if target.mode != RunKindPractice || !target.runItemID.Valid {
		return nil, nil
	}
	run := Run{
		ID: target.runID, UserID: userID, Kind: string(target.mode), Status: string(target.runStatus),
		BlueprintVersion: target.runBlueprint, ContentRevision: target.runRevision,
		StartedAt: target.runStartedAt, DeadlineAt: target.runDeadlineAt,
		SubmittedAt: target.runSubmittedAt, DurationMs: target.runDurationMs,
	}
	state, strict, err := loadSnapshottedPracticeState(ctx, queries, userID, run, nil)
	if err != nil || !strict {
		return nil, err
	}
	if input.RunItemID == nil || target.answerPartCount == nil || target.maxPoints != nil ||
		input.GradingKind != GradingKindAuto || input.EarnedPoints != nil ||
		input.StartedAt.UnixMilli() <= 0 || input.SubmittedAt.UnixMilli() <= 0 {
		return nil, invalidInput("attempt")
	}
	parts, ok := parseAnswerParts(input.Answer, *target.answerPartCount)
	if !ok {
		return nil, invalidInput("attempt")
	}
	switch input.Outcome {
	case AttemptOutcomeCorrect, AttemptOutcomeIncorrect, AttemptOutcomeSkipped:
	default:
		return nil, invalidInput("grading")
	}
	item, ok := state.itemByID[*input.RunItemID]
	if !ok || item.TaskID != target.taskID || item.ExamPosition != target.examPosition ||
		item.TaskRevision != target.taskRevision ||
		!samePointer(item.AnswerPartCount, target.answerPartCount) {
		return nil, invalidInput("runItemId")
	}

	itemAttempts := state.attemptsByItem[item.ID]
	if hasExisting {
		stored := state.attemptByID[input.ID]
		if stored == nil || !stored.RunItemID.Valid || uuid.UUID(stored.RunItemID.Bytes) != item.ID {
			return nil, invalidInput("attempt")
		}
		attemptNumber := slices.Index(itemAttempts, stored) + 1
		if attemptNumber < 1 || input.ID != practiceAttemptID(item.ID, attemptNumber) {
			return nil, invalidInput("attempt")
		}
		return matchingPracticeDraftTransition(state, item, input, parts, attemptNumber)
	}
	if target.runStatus != RunStatusActive {
		return nil, nil
	}
	if len(itemAttempts) >= maxPracticeAttemptsPerItem || practiceItemTerminal(itemAttempts) {
		return nil, invalidInput("attempt")
	}
	attemptNumber := len(itemAttempts) + 1
	if input.ID != practiceAttemptID(item.ID, attemptNumber) ||
		input.StartedAt.Before(state.lastSubmittedAt) ||
		(len(state.attemptByID) > 0 &&
			input.SubmittedAt.UnixMilli() <= state.lastSubmittedAt.UnixMilli()) {
		return nil, invalidInput("attempt")
	}
	if len(itemAttempts) > 0 && input.HelpLevel < itemAttempts[len(itemAttempts)-1].HelpLevel {
		return nil, invalidInput("helpLevel")
	}
	return matchingPracticeDraftTransition(state, item, input, parts, attemptNumber)
}

func matchingPracticeDraftTransition(
	state *practiceRunState,
	item RunItem,
	input RecordAttemptInput,
	parts []string,
	attemptNumber int,
) (*practiceAttemptTransition, error) {
	draft, ok := state.draftsByItem[item.ID]
	if !ok {
		return nil, nil
	}
	stored := hasStoredPracticeAttempt(state, input.ID)
	matches := draft.payload.NextAttempt == attemptNumber &&
		draft.payload.HelpLevel == input.HelpLevel &&
		slices.Equal(draft.payload.Answers, parts)
	if stored {
		if !draft.stale || !matches {
			return nil, nil
		}
	} else if draft.stale || !matches {
		return nil, ErrConflict
	}
	return &practiceAttemptTransition{runID: item.RunID, runItemID: item.ID}, nil
}

func hasStoredPracticeAttempt(state *practiceRunState, attemptID uuid.UUID) bool {
	return state.attemptByID[attemptID] != nil
}

func applyPracticeAttemptTransition(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	transition *practiceAttemptTransition,
) error {
	if transition == nil {
		return nil
	}
	_, err := queries.ConsumeRunCheckpointDraft(ctx, ConsumeRunCheckpointDraftParams{
		RunID: transition.runID, RunItemID: transition.runItemID, UserID: userID,
	})
	if err == pgx.ErrNoRows {
		return ErrConflict
	}
	return err
}

func validStoredPracticeAttempt(
	attempt *Attempt,
	item RunItem,
	run Run,
	attemptNumber int,
	previousSubmittedAt time.Time,
	hasPreviousAttempt bool,
	previousItem *Attempt,
) bool {
	if attemptNumber < 1 || attemptNumber > maxPracticeAttemptsPerItem ||
		!attempt.RunItemID.Valid || uuid.UUID(attempt.RunItemID.Bytes) != item.ID ||
		attempt.PublicID != practiceAttemptID(item.ID, attemptNumber) ||
		attempt.UserID != run.UserID || attempt.Source != string(RunKindPractice) ||
		attempt.TaskID != item.TaskID || attempt.Slot != int32(item.ExamPosition) ||
		attempt.Outcome == nil || attempt.GradingKind == nil || attempt.TaskRevision == nil ||
		GradingKind(*attempt.GradingKind) != GradingKindAuto ||
		*attempt.TaskRevision != item.TaskRevision || attempt.EarnedPoints != nil ||
		attempt.MaxPoints != nil || !attempt.StartedAt.Valid || !attempt.SubmittedAt.Valid ||
		attempt.StartedAt.Time.UnixMilli() <= 0 || attempt.SubmittedAt.Time.UnixMilli() <= 0 ||
		attempt.StartedAt.Time.Before(run.StartedAt) ||
		attempt.StartedAt.Time.Before(previousSubmittedAt) ||
		(hasPreviousAttempt &&
			attempt.SubmittedAt.Time.UnixMilli() <= previousSubmittedAt.UnixMilli()) ||
		attempt.SubmittedAt.Time.Before(attempt.StartedAt.Time) ||
		!validActiveDuration(attempt.ActiveDurationMs, attempt.SubmittedAt.Time.Sub(attempt.StartedAt.Time)) ||
		(run.SubmittedAt.Valid && attempt.SubmittedAt.Time.After(run.SubmittedAt.Time)) {
		return false
	}
	if _, ok := parseAnswerParts(attempt.Answer, *item.AnswerPartCount); !ok {
		return false
	}
	switch AttemptOutcome(*attempt.Outcome) {
	case AttemptOutcomeCorrect, AttemptOutcomeIncorrect, AttemptOutcomeSkipped:
	default:
		return false
	}
	if previousItem != nil &&
		(practiceAttemptTerminal(previousItem) || attempt.HelpLevel < previousItem.HelpLevel) {
		return false
	}
	return true
}

func practiceItemTerminal(attempts []*Attempt) bool {
	return len(attempts) > 0 && practiceAttemptTerminal(attempts[len(attempts)-1])
}

func practiceAttemptTerminal(attempt *Attempt) bool {
	if attempt == nil || attempt.Outcome == nil {
		return false
	}
	outcome := AttemptOutcome(*attempt.Outcome)
	return outcome == AttemptOutcomeCorrect || outcome == AttemptOutcomeSkipped
}
