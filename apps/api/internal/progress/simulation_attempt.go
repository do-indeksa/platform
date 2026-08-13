package progress

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"time"
	"unicode/utf16"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxSimulationAnswerLength = 200

func simulationAutoAttemptID(runItemID uuid.UUID) uuid.UUID {
	return uuid.NewSHA1(runItemID, []byte("attempt:1"))
}

func simulationRubricAttemptID(runItemID uuid.UUID) uuid.UUID {
	return uuid.NewSHA1(runItemID, []byte("attempt:rubric-self:1"))
}

func validateSnapshottedSimulationAttempt(
	input RecordAttemptInput,
	target attemptTarget,
) error {
	if target.mode != RunKindSimulation || target.answerPartCount == nil {
		return nil
	}
	if input.RunItemID == nil || input.HelpLevel != 0 || !input.StartedAt.Equal(target.runStartedAt) {
		return invalidInput("attempt")
	}
	expectedID := simulationAutoAttemptID(*input.RunItemID)
	if input.GradingKind == GradingKindRubricSelf {
		expectedID = simulationRubricAttemptID(*input.RunItemID)
	}
	if input.ID != expectedID {
		return invalidInput("id")
	}

	parts, hasAnswer := parseSimulationAnswer(input.Answer, *target.answerPartCount)
	hasSubmittedAnswer := hasAnswer && slices.ContainsFunc(parts, func(part string) bool {
		return !simulationAnswerPartBlank(part)
	})
	switch input.GradingKind {
	case GradingKindAuto:
		switch input.Outcome {
		case AttemptOutcomeCorrect:
			if !hasSubmittedAnswer || !exactPoints(input.EarnedPoints, target.maxPoints) {
				return invalidInput("attempt")
			}
		case AttemptOutcomeIncorrect:
			if !hasSubmittedAnswer || !exactPoints(input.EarnedPoints, int16Pointer(0)) {
				return invalidInput("attempt")
			}
		case AttemptOutcomeSkipped:
			if input.Answer != nil || input.EarnedPoints != nil {
				return invalidInput("attempt")
			}
		default:
			return invalidInput("grading")
		}
	case GradingKindRubricSelf:
		switch input.Outcome {
		case AttemptOutcomePartial:
			if !hasAnswer || input.EarnedPoints == nil {
				return invalidInput("attempt")
			}
		case AttemptOutcomeIncorrect:
			if !hasSubmittedAnswer || !exactPoints(input.EarnedPoints, int16Pointer(0)) {
				return invalidInput("attempt")
			}
		case AttemptOutcomeSkipped:
			if input.Answer != nil || input.EarnedPoints != nil {
				return invalidInput("attempt")
			}
		default:
			return invalidInput("grading")
		}
	default:
		return invalidInput("grading")
	}
	return nil
}

func validateSnapshottedSimulationRubricPredecessor(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	input RecordAttemptInput,
	target attemptTarget,
) error {
	if target.mode != RunKindSimulation || target.answerPartCount == nil ||
		input.GradingKind != GradingKindRubricSelf || input.RunItemID == nil {
		return nil
	}
	auto, err := queries.GetAttempt(ctx, GetAttemptParams{
		PublicID: simulationAutoAttemptID(*input.RunItemID), UserID: userID,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return invalidInput("grading")
	}
	if err != nil {
		return err
	}
	if !auto.RunItemID.Valid || uuid.UUID(auto.RunItemID.Bytes) != *input.RunItemID ||
		auto.Outcome == nil || auto.GradingKind == nil || auto.TaskRevision == nil ||
		auto.Source != string(RunKindSimulation) || auto.TaskID != target.taskID ||
		auto.Slot != int32(target.examPosition) || *auto.TaskRevision != target.taskRevision ||
		!samePointer(auto.MaxPoints, target.maxPoints) || !auto.StartedAt.Valid ||
		!auto.SubmittedAt.Valid || !auto.StartedAt.Time.Equal(input.StartedAt) ||
		!auto.SubmittedAt.Time.Equal(input.SubmittedAt) {
		return invalidInput("grading")
	}
	autoInput := RecordAttemptInput{
		ID: auto.PublicID, RunItemID: input.RunItemID,
		StartedAt: auto.StartedAt.Time, SubmittedAt: auto.SubmittedAt.Time,
		ActiveDurationMs: auto.ActiveDurationMs, Answer: auto.Answer,
		Outcome: AttemptOutcome(*auto.Outcome), HelpLevel: auto.HelpLevel,
		GradingKind: GradingKind(*auto.GradingKind), EarnedPoints: auto.EarnedPoints,
	}
	if validateSnapshottedSimulationAttempt(autoInput, target) != nil {
		return invalidInput("grading")
	}
	autoParts, autoOK := simulationInputParts(autoInput, *target.answerPartCount)
	rubricParts, rubricOK := simulationInputParts(input, *target.answerPartCount)
	if !autoOK || !rubricOK || !validSimulationAttemptTransition(
		autoInput.Outcome,
		input.Outcome,
		autoParts,
		rubricParts,
		simulationInputSkipped(autoInput, autoParts),
		simulationInputSkipped(input, rubricParts),
	) {
		return invalidInput("grading")
	}
	return nil
}

func validateSnapshottedSimulationSubmission(
	ctx context.Context,
	queries *Queries,
	userID uuid.UUID,
	run Run,
	submittedAt time.Time,
) error {
	if RunKind(run.Kind) != RunKindSimulation {
		return nil
	}
	items, err := queries.ListRunItems(ctx, ListRunItemsParams{RunID: run.ID, UserID: userID})
	if err != nil {
		return err
	}
	snapshottedItems := 0
	for _, item := range items {
		if item.AnswerPartCount != nil {
			snapshottedItems++
		}
	}
	if snapshottedItems == 0 {
		return nil
	}
	if snapshottedItems != len(items) {
		return invalidInput("items.answerPartCount")
	}
	attempts, err := queries.ListRunAttempts(ctx, ListRunAttemptsParams{
		RunID: run.ID, UserID: userID, MaxAttempts: MaxRecentRunItemAttempts,
	})
	if err != nil {
		return err
	}

	type itemAttempts struct {
		auto   *Attempt
		rubric *Attempt
	}
	itemByID := make(map[uuid.UUID]RunItem, len(items))
	attemptsByItem := make(map[uuid.UUID]*itemAttempts, len(items))
	for _, item := range items {
		itemByID[item.ID] = item
		attemptsByItem[item.ID] = &itemAttempts{}
	}
	for index := range attempts {
		attempt := &attempts[index]
		if !attempt.RunItemID.Valid || !attempt.StartedAt.Valid || !attempt.SubmittedAt.Valid ||
			attempt.Outcome == nil || attempt.GradingKind == nil || attempt.TaskRevision == nil {
			return invalidInput("attempts")
		}
		itemID := uuid.UUID(attempt.RunItemID.Bytes)
		item, ok := itemByID[itemID]
		if !ok || attempt.Source != string(RunKindSimulation) || attempt.TaskID != item.TaskID ||
			attempt.Slot != int32(item.ExamPosition) || !attempt.SubmittedAt.Time.Equal(submittedAt) ||
			!samePointer(attempt.MaxPoints, item.MaxPoints) || *attempt.TaskRevision != item.TaskRevision {
			return invalidInput("attempts")
		}
		runItemID := itemID
		stored := RecordAttemptInput{
			ID: attempt.PublicID, RunItemID: &runItemID,
			StartedAt: attempt.StartedAt.Time, SubmittedAt: attempt.SubmittedAt.Time,
			ActiveDurationMs: attempt.ActiveDurationMs, Answer: attempt.Answer,
			Outcome: AttemptOutcome(*attempt.Outcome), HelpLevel: attempt.HelpLevel,
			GradingKind: GradingKind(*attempt.GradingKind), EarnedPoints: attempt.EarnedPoints,
		}
		target := attemptTarget{
			runItemID: attempt.RunItemID, runStatus: RunStatusActive,
			taskID: item.TaskID, examPosition: item.ExamPosition, mode: RunKindSimulation,
			maxPoints: item.MaxPoints, answerPartCount: item.AnswerPartCount,
			taskRevision: item.TaskRevision, runStartedAt: run.StartedAt,
		}
		if err := validateSnapshottedSimulationAttempt(stored, target); err != nil {
			return invalidInput("attempts")
		}
		group := attemptsByItem[itemID]
		switch stored.GradingKind {
		case GradingKindAuto:
			if group.auto != nil {
				return invalidInput("attempts")
			}
			group.auto = attempt
		case GradingKindRubricSelf:
			if group.rubric != nil {
				return invalidInput("attempts")
			}
			group.rubric = attempt
		}
	}

	for _, item := range items {
		group := attemptsByItem[item.ID]
		if group.auto == nil ||
			(group.auto != nil && group.rubric != nil &&
				!validSimulationAttemptSequence(item, group.auto, group.rubric)) {
			return invalidInput("attempts")
		}
	}
	return nil
}

func validSimulationAttemptSequence(item RunItem, auto, rubric *Attempt) bool {
	if rubric == nil {
		return true
	}
	if rubric.ID <= auto.ID || auto.Outcome == nil || rubric.Outcome == nil {
		return false
	}
	autoOutcome := AttemptOutcome(*auto.Outcome)
	rubricOutcome := AttemptOutcome(*rubric.Outcome)
	autoParts, autoOK := simulationAttemptParts(auto, *item.AnswerPartCount)
	rubricParts, rubricOK := simulationAttemptParts(rubric, *item.AnswerPartCount)
	return autoOK && rubricOK && validSimulationAttemptTransition(
		autoOutcome,
		rubricOutcome,
		autoParts,
		rubricParts,
		simulationAttemptSkipped(auto, autoParts),
		simulationAttemptSkipped(rubric, rubricParts),
	)
}

func validSimulationAttemptTransition(
	autoOutcome, rubricOutcome AttemptOutcome,
	autoParts, rubricParts []string,
	autoSkipped, rubricSkipped bool,
) bool {
	if !slices.Equal(autoParts, rubricParts) || autoSkipped != rubricSkipped {
		return false
	}
	switch autoOutcome {
	case AttemptOutcomeIncorrect:
		return rubricOutcome == AttemptOutcomePartial || rubricOutcome == AttemptOutcomeIncorrect
	case AttemptOutcomeSkipped:
		return rubricOutcome == AttemptOutcomePartial || rubricOutcome == AttemptOutcomeSkipped
	default:
		return false
	}
}

func simulationAttemptParts(attempt *Attempt, count int16) ([]string, bool) {
	if attempt.Outcome != nil && AttemptOutcome(*attempt.Outcome) == AttemptOutcomeSkipped {
		return make([]string, count), true
	}
	return parseSimulationAnswer(attempt.Answer, count)
}

func simulationAttemptSkipped(attempt *Attempt, parts []string) bool {
	if attempt.Outcome != nil && AttemptOutcome(*attempt.Outcome) == AttemptOutcomeSkipped {
		return true
	}
	return !slices.ContainsFunc(parts, func(part string) bool { return part != "" })
}

func simulationInputParts(input RecordAttemptInput, count int16) ([]string, bool) {
	if input.Outcome == AttemptOutcomeSkipped {
		return make([]string, count), true
	}
	return parseSimulationAnswer(input.Answer, count)
}

func simulationInputSkipped(input RecordAttemptInput, parts []string) bool {
	return input.Outcome == AttemptOutcomeSkipped ||
		!slices.ContainsFunc(parts, func(part string) bool { return part != "" })
}

func parseSimulationAnswer(value *string, count int16) ([]string, bool) {
	if value == nil {
		return nil, false
	}
	var parts []string
	if err := json.Unmarshal([]byte(*value), &parts); err != nil || len(parts) != int(count) {
		return nil, false
	}
	for _, part := range parts {
		if len(utf16.Encode([]rune(part))) > maxSimulationAnswerLength {
			return nil, false
		}
	}
	return parts, true
}

// Keep this set aligned with ECMAScript TrimString, which defines String.trim().
func simulationAnswerPartBlank(value string) bool {
	for _, character := range value {
		switch character {
		case '\u0009', '\u000A', '\u000B', '\u000C', '\u000D', '\u0020',
			'\u00A0', '\u1680', '\u2028', '\u2029', '\u202F', '\u205F', '\u3000', '\uFEFF':
			continue
		}
		if character < '\u2000' || character > '\u200A' {
			return false
		}
	}
	return true
}

func exactPoints(left, right *int16) bool {
	return left != nil && right != nil && *left == *right
}

func int16Pointer(value int16) *int16 {
	return &value
}
