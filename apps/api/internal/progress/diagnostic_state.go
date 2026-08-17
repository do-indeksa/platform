package progress

import (
	"context"
	"time"

	"github.com/google/uuid"
)

type diagnosticRunState struct {
	items               []RunItem
	attemptsByItem      map[uuid.UUID]*Attempt
	completedItems      int
	previousSubmittedAt time.Time
	checkpoint          *RunCheckpointAggregate
	checkpointStale     bool
}

func loadSnapshottedDiagnosticState(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	run Run,
	items []RunItem,
) (*diagnosticRunState, bool, error) {
	if RunKind(run.Kind) != RunKindDiagnostic {
		return nil, false, nil
	}
	var err error
	if items == nil {
		items, err = queries.ListRunItems(ctx, ListRunItemsParams{RunID: run.ID, UserID: userID})
		if err != nil {
			return nil, false, err
		}
	}
	strict, err := classifySnapshottedDiagnosticAssignment(run, items)
	if err != nil || !strict {
		return nil, strict, err
	}

	attempts, err := queries.ListRunAttempts(ctx, ListRunAttemptsParams{
		RunID: run.ID, UserID: userID, MaxAttempts: MaxRecentRunItemAttempts,
	})
	if err != nil {
		return nil, true, err
	}
	state := &diagnosticRunState{
		items: items, attemptsByItem: make(map[uuid.UUID]*Attempt, len(items)),
		previousSubmittedAt: run.StartedAt,
	}
	itemByID := make(map[uuid.UUID]RunItem, len(items))
	for _, item := range items {
		itemByID[item.ID] = item
	}
	for index := range attempts {
		attempt := &attempts[index]
		if !attempt.RunItemID.Valid {
			return nil, true, invalidInput("attempts")
		}
		itemID := uuid.UUID(attempt.RunItemID.Bytes)
		if _, ok := itemByID[itemID]; !ok || state.attemptsByItem[itemID] != nil {
			return nil, true, invalidInput("attempts")
		}
		state.attemptsByItem[itemID] = attempt
	}

	gap := false
	for _, item := range items {
		attempt := state.attemptsByItem[item.ID]
		if attempt == nil {
			gap = true
			continue
		}
		if gap || !validStoredDiagnosticAttempt(attempt, item, run, state.previousSubmittedAt) {
			return nil, true, invalidInput("attempts")
		}
		state.completedItems++
		state.previousSubmittedAt = attempt.SubmittedAt.Time
	}
	state.checkpoint, err = loadRunCheckpoint(ctx, queries, userID, run.ID)
	if err != nil {
		return nil, true, err
	}
	checkpointStale, valid := classifyStoredDiagnosticCheckpoint(state)
	if !valid {
		return nil, true, invalidInput("checkpoint")
	}
	state.checkpointStale = checkpointStale
	return state, true, nil
}

func classifySnapshottedDiagnosticAssignment(run Run, items []RunItem) (bool, error) {
	if RunKind(run.Kind) != RunKindDiagnostic {
		return false, nil
	}
	snapshottedItems := 0
	for _, item := range items {
		if item.AnswerPartCount != nil {
			snapshottedItems++
		}
	}
	if snapshottedItems == 0 {
		return false, nil
	}
	if snapshottedItems != len(items) || !validSnapshottedDiagnosticRun(run, items) {
		return true, invalidInput("items")
	}
	return true, nil
}

func validSnapshottedDiagnosticRun(run Run, items []RunItem) bool {
	if len(items) != P1TaskCount || !p1BlueprintPattern.MatchString(run.BlueprintVersion) ||
		!snapshotRevisionPattern.MatchString(run.ContentRevision) || run.StartedAt.UnixMilli() <= 0 {
		return false
	}
	for index, item := range items {
		if item.RunID != run.ID || item.UserID != run.UserID || item.Ordinal != int16(index+1) ||
			item.ExamPosition != int16(index+1) || item.MaxPoints != nil ||
			item.AnswerPartCount == nil || *item.AnswerPartCount < 1 ||
			*item.AnswerPartCount > maxAnswerPartCount ||
			item.ID != runItemSnapshotID(run.ID, item.TaskID) ||
			!snapshotRevisionPattern.MatchString(item.TaskRevision) {
			return false
		}
	}
	return true
}
