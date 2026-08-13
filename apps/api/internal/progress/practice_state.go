package progress

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"time"

	"github.com/google/uuid"
)

const (
	practiceDraftVersion       = 1
	maxPracticeAttemptsPerItem = 20
)

type practiceCheckpointDraftPayload struct {
	Version     int      `json:"version"`
	NextAttempt int      `json:"nextAttempt"`
	Answers     []string `json:"answers"`
	HelpLevel   int16    `json:"helpLevel"`
}

type storedPracticeDraft struct {
	payload practiceCheckpointDraftPayload
	stale   bool
}

type practiceRunState struct {
	items           []RunItem
	itemByID        map[uuid.UUID]RunItem
	attemptsByItem  map[uuid.UUID][]*Attempt
	attemptByID     map[uuid.UUID]*Attempt
	lastSubmittedAt time.Time
	checkpoint      *RunCheckpointAggregate
	draftsByItem    map[uuid.UUID]storedPracticeDraft
}

func loadSnapshottedPracticeState(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	run Run,
	items []RunItem,
) (*practiceRunState, bool, error) {
	if RunKind(run.Kind) != RunKindPractice {
		return nil, false, nil
	}
	var err error
	if items == nil {
		items, err = queries.ListRunItems(ctx, ListRunItemsParams{RunID: run.ID, UserID: userID})
		if err != nil {
			return nil, false, err
		}
	}
	strict, err := classifySnapshottedPracticeAssignment(run, items)
	if err != nil || !strict {
		return nil, strict, err
	}

	attempts, err := queries.ListRunAttempts(ctx, ListRunAttemptsParams{
		RunID: run.ID, UserID: userID, MaxAttempts: maxPracticeAttemptsPerItem + 1,
	})
	if err != nil {
		return nil, true, err
	}
	state := &practiceRunState{
		items: items, itemByID: make(map[uuid.UUID]RunItem, len(items)),
		attemptsByItem:  make(map[uuid.UUID][]*Attempt, len(items)),
		attemptByID:     make(map[uuid.UUID]*Attempt, len(attempts)),
		lastSubmittedAt: run.StartedAt,
		draftsByItem:    make(map[uuid.UUID]storedPracticeDraft, len(items)),
	}
	for _, item := range items {
		state.itemByID[item.ID] = item
		state.attemptsByItem[item.ID] = []*Attempt{}
	}
	for index := range attempts {
		attempt := &attempts[index]
		if !attempt.RunItemID.Valid {
			return nil, true, invalidInput("attempts")
		}
		itemID := uuid.UUID(attempt.RunItemID.Bytes)
		item, ok := state.itemByID[itemID]
		if !ok || state.attemptByID[attempt.PublicID] != nil {
			return nil, true, invalidInput("attempts")
		}
		itemAttempts := state.attemptsByItem[itemID]
		var previousItem *Attempt
		if len(itemAttempts) > 0 {
			previousItem = itemAttempts[len(itemAttempts)-1]
		}
		if !validStoredPracticeAttempt(
			attempt, item, run, len(itemAttempts)+1, state.lastSubmittedAt, previousItem,
		) {
			return nil, true, invalidInput("attempts")
		}
		state.attemptsByItem[itemID] = append(itemAttempts, attempt)
		state.attemptByID[attempt.PublicID] = attempt
		state.lastSubmittedAt = attempt.SubmittedAt.Time
	}

	state.checkpoint, err = loadRunCheckpoint(ctx, queries, userID, run.ID)
	if err != nil {
		return nil, true, err
	}
	if RunStatus(run.Status) != RunStatusActive && state.checkpoint != nil {
		return nil, true, invalidInput("checkpoint")
	}
	if err := classifyStoredPracticeCheckpoint(state); err != nil {
		return nil, true, err
	}
	return state, true, nil
}

func classifySnapshottedPracticeAssignment(run Run, items []RunItem) (bool, error) {
	if RunKind(run.Kind) != RunKindPractice {
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
	if snapshottedItems != len(items) || !validSnapshottedPracticeRun(run, items) {
		return true, invalidInput("items")
	}
	return true, nil
}

func validSnapshottedPracticeRun(run Run, items []RunItem) bool {
	if len(items) < 1 || len(items) > maxPracticeTaskCount || run.DeadlineAt.Valid ||
		!p1BlueprintPattern.MatchString(run.BlueprintVersion) ||
		!snapshotRevisionPattern.MatchString(run.ContentRevision) || run.StartedAt.UnixMilli() <= 0 {
		return false
	}
	status := RunStatus(run.Status)
	isSubmitted := status == RunStatusSubmitted
	if (status != RunStatusActive && status != RunStatusSubmitted && status != RunStatusAbandoned) ||
		isSubmitted != run.SubmittedAt.Valid ||
		(run.SubmittedAt.Valid && (run.SubmittedAt.Time.Before(run.StartedAt) || run.DurationMs == nil ||
			!validRunActiveDuration(
				RunKindPractice, run.DurationMs, run.SubmittedAt.Time.Sub(run.StartedAt),
			))) ||
		(!run.SubmittedAt.Valid && run.DurationMs != nil) {
		return false
	}
	for index, item := range items {
		if item.RunID != run.ID || item.UserID != run.UserID || item.Ordinal != int16(index+1) ||
			item.MaxPoints != nil || item.AnswerPartCount == nil || *item.AnswerPartCount < 1 ||
			*item.AnswerPartCount > maxAnswerPartCount ||
			item.ID != runItemSnapshotID(run.ID, item.TaskID) ||
			!snapshotRevisionPattern.MatchString(item.TaskRevision) {
			return false
		}
	}
	return true
}

func parsePracticeCheckpointDraft(
	value string,
	answerPartCount int16,
) (practiceCheckpointDraftPayload, bool) {
	decoder := json.NewDecoder(bytes.NewBufferString(value))
	decoder.DisallowUnknownFields()
	var payload practiceCheckpointDraftPayload
	if err := decoder.Decode(&payload); err != nil {
		return practiceCheckpointDraftPayload{}, false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return practiceCheckpointDraftPayload{}, false
	}
	if payload.Version != practiceDraftVersion || payload.NextAttempt < 1 ||
		payload.NextAttempt > maxPracticeAttemptsPerItem || payload.HelpLevel < 0 ||
		payload.HelpLevel > 3 || !validAnswerParts(payload.Answers, answerPartCount) {
		return practiceCheckpointDraftPayload{}, false
	}
	return payload, true
}
