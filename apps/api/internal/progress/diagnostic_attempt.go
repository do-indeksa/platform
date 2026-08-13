package progress

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type diagnosticAttemptTransition struct {
	runID             uuid.UUID
	nextOrdinal       int16
	checkpointVersion int64
}

func validateSnapshottedDiagnosticAttempt(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	input RecordAttemptInput,
	target attemptTarget,
	hasExisting bool,
) (*diagnosticAttemptTransition, error) {
	if target.mode != RunKindDiagnostic {
		return nil, nil
	}
	run := Run{
		ID: target.runID, UserID: userID, Kind: string(target.mode), Status: string(target.runStatus),
		BlueprintVersion: target.runBlueprint, ContentRevision: target.runRevision,
		StartedAt: target.runStartedAt,
	}
	state, strict, err := loadSnapshottedDiagnosticState(ctx, queries, userID, run, nil)
	if err != nil {
		return nil, err
	}
	if !strict {
		return nil, nil
	}
	if target.answerPartCount == nil || input.RunItemID == nil ||
		input.ID != progressAutoAttemptID(*input.RunItemID) || input.HelpLevel != 0 ||
		input.GradingKind != GradingKindAuto || input.EarnedPoints != nil ||
		input.StartedAt.UnixMilli() <= 0 || input.SubmittedAt.UnixMilli() <= 0 {
		return nil, invalidInput("attempt")
	}
	switch input.Outcome {
	case AttemptOutcomeCorrect, AttemptOutcomeIncorrect:
		if _, ok := parseAnswerParts(input.Answer, *target.answerPartCount); !ok {
			return nil, invalidInput("attempt")
		}
	case AttemptOutcomeSkipped:
		if input.Answer != nil {
			return nil, invalidInput("attempt")
		}
	default:
		return nil, invalidInput("grading")
	}
	itemIndex := -1
	for index, item := range state.items {
		if item.ID == *input.RunItemID {
			itemIndex = index
			if item.TaskID != target.taskID || item.ExamPosition != target.examPosition ||
				item.TaskRevision != target.taskRevision ||
				!samePointer(item.AnswerPartCount, target.answerPartCount) {
				return nil, invalidInput("attempt")
			}
			break
		}
	}
	if itemIndex < 0 {
		return nil, invalidInput("runItemId")
	}
	if hasExisting {
		stored := state.attemptsByItem[*input.RunItemID]
		if stored == nil || stored.PublicID != input.ID {
			return nil, invalidInput("attempt")
		}
		if state.checkpointStale {
			return diagnosticCheckpointTransition(state, target.runID, state.completedItems), nil
		}
		return nil, nil
	}
	if target.runStatus != RunStatusActive {
		return nil, nil
	}
	if itemIndex != state.completedItems || input.StartedAt.Before(state.previousSubmittedAt) {
		return nil, invalidInput("attempt")
	}
	return diagnosticCheckpointTransition(state, target.runID, state.completedItems+1), nil
}

func diagnosticCheckpointTransition(
	state *diagnosticRunState,
	runID uuid.UUID,
	completedItems int,
) *diagnosticAttemptTransition {
	if state.checkpoint == nil {
		return nil
	}
	nextOrdinal := int16(completedItems + 1)
	if nextOrdinal > int16(len(state.items)) {
		nextOrdinal = int16(len(state.items))
	}
	return &diagnosticAttemptTransition{
		runID: runID, nextOrdinal: nextOrdinal,
		checkpointVersion: state.checkpoint.Checkpoint.Version,
	}
}

func applyDiagnosticAttemptTransition(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	transition *diagnosticAttemptTransition,
) error {
	if transition == nil {
		return nil
	}
	if _, err := queries.CanonicalizeDiagnosticCheckpoint(
		ctx,
		CanonicalizeDiagnosticCheckpointParams{
			RunID:          transition.runID,
			UserID:         userID,
			Version:        transition.checkpointVersion,
			CurrentOrdinal: transition.nextOrdinal,
		},
	); err != nil {
		return err
	}
	return queries.DeleteRunCheckpointDrafts(ctx, DeleteRunCheckpointDraftsParams{
		RunID: transition.runID, UserID: userID,
	})
}

func validStoredDiagnosticAttempt(
	attempt *Attempt,
	item RunItem,
	run Run,
	previousSubmittedAt time.Time,
) bool {
	if !attempt.RunItemID.Valid || uuid.UUID(attempt.RunItemID.Bytes) != item.ID ||
		attempt.PublicID != progressAutoAttemptID(item.ID) || attempt.UserID != run.UserID ||
		attempt.Source != string(RunKindDiagnostic) || attempt.TaskID != item.TaskID ||
		attempt.Slot != int32(item.ExamPosition) || attempt.HelpLevel != 0 ||
		attempt.Outcome == nil || attempt.GradingKind == nil || attempt.TaskRevision == nil ||
		GradingKind(*attempt.GradingKind) != GradingKindAuto || *attempt.TaskRevision != item.TaskRevision ||
		attempt.EarnedPoints != nil || !samePointer(attempt.MaxPoints, item.MaxPoints) ||
		!attempt.StartedAt.Valid || !attempt.SubmittedAt.Valid ||
		attempt.StartedAt.Time.UnixMilli() <= 0 || attempt.SubmittedAt.Time.UnixMilli() <= 0 ||
		attempt.StartedAt.Time.Before(run.StartedAt) ||
		attempt.StartedAt.Time.Before(previousSubmittedAt) ||
		attempt.SubmittedAt.Time.Before(attempt.StartedAt.Time) {
		return false
	}
	switch AttemptOutcome(*attempt.Outcome) {
	case AttemptOutcomeCorrect, AttemptOutcomeIncorrect:
		_, ok := parseAnswerParts(attempt.Answer, *item.AnswerPartCount)
		return ok
	case AttemptOutcomeSkipped:
		return attempt.Answer == nil
	default:
		return false
	}
}
