package progress

import (
	"context"
	"slices"
	"time"

	"github.com/google/uuid"
)

func validateSnapshottedPracticeCheckpoint(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	run Run,
	items []RunItem,
	input CheckpointRunInput,
) error {
	if RunKind(run.Kind) != RunKindPractice {
		return nil
	}
	state, strict, err := loadSnapshottedPracticeState(ctx, queries, userID, run, items)
	if err != nil {
		return err
	}
	if !strict {
		return ErrInvalidTransition
	}
	if state.checkpoint == nil {
		if input.ExpectedVersion != 0 {
			return ErrConflict
		}
	} else if input.ExpectedVersion != state.checkpoint.Checkpoint.Version {
		return ErrConflict
	}
	if input.CurrentOrdinal < 1 || int(input.CurrentOrdinal) > len(state.items) ||
		len(input.Drafts) > len(state.items) {
		return invalidInput("checkpoint")
	}
	for _, draft := range input.Drafts {
		item, ok := state.itemByID[draft.RunItemID]
		if !ok || item.AnswerPartCount == nil {
			return invalidInput("drafts.runItemId")
		}
		payload, ok := parsePracticeCheckpointDraft(draft.Answer, *item.AnswerPartCount)
		if !ok || !validCurrentPracticeDraft(payload, state.attemptsByItem[item.ID]) {
			return invalidInput("drafts.answer")
		}
	}
	return nil
}

func validateSnapshottedPracticeSubmission(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	run Run,
	submittedAt time.Time,
	activeDurationMs int64,
) error {
	state, strict, err := loadSnapshottedPracticeState(ctx, queries, userID, run, nil)
	if err != nil || !strict {
		return err
	}
	if len(state.attemptByID) == 0 {
		return invalidInput("attempts")
	}
	if submittedAt.Before(state.lastSubmittedAt) {
		return invalidInput("submittedAt")
	}
	if state.checkpoint != nil && state.checkpoint.Checkpoint.ActiveDurationMs != nil &&
		activeDurationMs < *state.checkpoint.Checkpoint.ActiveDurationMs {
		return invalidInput("activeDurationMs")
	}
	return nil
}

func classifyStoredPracticeCheckpoint(state *practiceRunState) error {
	if state.checkpoint == nil {
		return nil
	}
	checkpoint := state.checkpoint.Checkpoint
	if checkpoint.Version < 1 || checkpoint.UpdatedAt.UnixMilli() <= 0 ||
		checkpoint.CurrentOrdinal < 1 || int(checkpoint.CurrentOrdinal) > len(state.items) ||
		len(state.checkpoint.Drafts) > len(state.items) {
		return invalidInput("checkpoint")
	}
	for _, draft := range state.checkpoint.Drafts {
		item, ok := state.itemByID[draft.RunItemID]
		if !ok || item.AnswerPartCount == nil {
			return invalidInput("checkpoint")
		}
		payload, ok := parsePracticeCheckpointDraft(draft.Answer, *item.AnswerPartCount)
		if !ok {
			return invalidInput("checkpoint")
		}
		attempts := state.attemptsByItem[item.ID]
		stale := validStalePracticeDraft(payload, attempts)
		if !validCurrentPracticeDraft(payload, attempts) && !stale {
			return invalidInput("checkpoint")
		}
		state.draftsByItem[item.ID] = storedPracticeDraft{payload: payload, stale: stale}
	}
	return nil
}

func validCurrentPracticeDraft(
	payload practiceCheckpointDraftPayload,
	attempts []*Attempt,
) bool {
	if len(attempts) >= maxPracticeAttemptsPerItem || practiceItemTerminal(attempts) ||
		payload.NextAttempt != len(attempts)+1 {
		return false
	}
	return len(attempts) == 0 || payload.HelpLevel >= attempts[len(attempts)-1].HelpLevel
}

func validStalePracticeDraft(
	payload practiceCheckpointDraftPayload,
	attempts []*Attempt,
) bool {
	if len(attempts) == 0 || payload.NextAttempt != len(attempts) {
		return false
	}
	latest := attempts[len(attempts)-1]
	parts, ok := parseAnswerParts(latest.Answer, int16(len(payload.Answers)))
	return ok && payload.HelpLevel == latest.HelpLevel && slices.Equal(payload.Answers, parts)
}
