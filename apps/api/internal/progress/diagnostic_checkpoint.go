package progress

import (
	"context"

	"github.com/google/uuid"
)

func validateSnapshottedDiagnosticCheckpoint(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	run Run,
	items []RunItem,
	input CheckpointRunInput,
) error {
	state, strict, err := loadSnapshottedDiagnosticState(ctx, queries, userID, run, items)
	if err != nil || !strict {
		return err
	}
	if state.checkpoint == nil {
		if input.ExpectedVersion != 0 {
			return ErrConflict
		}
	} else if input.ExpectedVersion != state.checkpoint.Checkpoint.Version {
		return ErrConflict
	}
	if state.completedItems < len(state.items) {
		if input.CurrentOrdinal != int16(state.completedItems+1) {
			if input.CurrentOrdinal <= int16(state.completedItems) ||
				(state.checkpoint != nil &&
					input.CurrentOrdinal != state.checkpoint.Checkpoint.CurrentOrdinal) {
				return ErrConflict
			}
			return invalidInput("checkpoint")
		}
	} else if input.CurrentOrdinal < 1 || int(input.CurrentOrdinal) > len(state.items) {
		return invalidInput("checkpoint")
	}
	if len(input.Drafts) > 1 {
		return invalidInput("drafts")
	}
	if len(input.Drafts) == 0 {
		return nil
	}
	item := state.items[input.CurrentOrdinal-1]
	draft := input.Drafts[0]
	if draft.RunItemID != item.ID || item.AnswerPartCount == nil {
		return invalidInput("drafts.runItemId")
	}
	answer := draft.Answer
	if _, ok := parseAnswerParts(&answer, *item.AnswerPartCount); !ok {
		return invalidInput("drafts.answer")
	}
	return nil
}

func validateSnapshottedDiagnosticSubmission(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	run Run,
) error {
	state, strict, err := loadSnapshottedDiagnosticState(ctx, queries, userID, run, nil)
	if err != nil || !strict {
		return err
	}
	if state.completedItems != len(state.items) {
		return invalidInput("attempts")
	}
	return nil
}

func classifyStoredDiagnosticCheckpoint(state *diagnosticRunState) (stale, valid bool) {
	if state.checkpoint == nil {
		return false, true
	}
	checkpoint := state.checkpoint.Checkpoint
	if checkpoint.Version < 1 || checkpoint.UpdatedAt.UnixMilli() <= 0 || len(state.checkpoint.Drafts) > 1 {
		return false, false
	}
	if checkpoint.CurrentOrdinal < 1 || int(checkpoint.CurrentOrdinal) > len(state.items) {
		return false, false
	}
	if len(state.checkpoint.Drafts) > 0 {
		item := state.items[checkpoint.CurrentOrdinal-1]
		draft := state.checkpoint.Drafts[0]
		if draft.RunItemID != item.ID || item.AnswerPartCount == nil {
			return false, false
		}
		answer := draft.Answer
		if _, ok := parseAnswerParts(&answer, *item.AnswerPartCount); !ok {
			return false, false
		}
	}
	if state.completedItems == len(state.items) {
		return false, true
	}
	expectedOrdinal := int16(state.completedItems + 1)
	if checkpoint.CurrentOrdinal == expectedOrdinal {
		return false, true
	}
	if checkpoint.CurrentOrdinal <= int16(state.completedItems) {
		return true, true
	}
	return false, false
}
