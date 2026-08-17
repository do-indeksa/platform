package progress

import (
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxTaskIDSize       = 64
	maxRevisionSize     = 128
	maxBlueprintSize    = 64
	maxAnswerCharacters = 8192
)

var taskIDPattern = regexp.MustCompile(`^[a-z0-9-]+$`)

func validTaskID(taskID string) bool {
	return taskID != "" && len(taskID) <= maxTaskIDSize && taskIDPattern.MatchString(taskID)
}

func validMetadataText(value string, maxBytes int) bool {
	return value != "" && len(value) <= maxBytes && validDatabaseText(value)
}

func validDatabaseText(value string) bool {
	return utf8.ValidString(value) && !strings.ContainsRune(value, '\x00')
}

func validRunKind(kind RunKind) bool {
	return kind == RunKindPractice || kind == RunKindDiagnostic || kind == RunKindSimulation
}

func validOutcome(outcome AttemptOutcome) bool {
	return outcome == AttemptOutcomeCorrect || outcome == AttemptOutcomeIncorrect ||
		outcome == AttemptOutcomePartial || outcome == AttemptOutcomeSkipped ||
		outcome == AttemptOutcomeUngraded
}

func validClientGradingKind(kind GradingKind) bool {
	return kind == GradingKindAuto || kind == GradingKindRubricSelf
}

func validRevision(revision string) bool {
	return validMetadataText(revision, maxRevisionSize)
}

func invalidInput(field string) error {
	return fmt.Errorf("%w: %s", ErrInvalidInput, field)
}

func validAnswer(answer *string) bool {
	return answer == nil || validAnswerText(*answer)
}

func validAnswerText(answer string) bool {
	return validDatabaseText(answer) && utf8.RuneCountInString(answer) <= maxAnswerCharacters
}

func validActiveDuration(activeDurationMs *int64, elapsed time.Duration) bool {
	return activeDurationMs == nil ||
		(*activeDurationMs >= 0 && *activeDurationMs <= elapsed.Milliseconds()+clientClockSkew.Milliseconds())
}

func validRunActiveDuration(kind RunKind, activeDurationMs *int64, elapsed time.Duration) bool {
	return validActiveDuration(activeDurationMs, elapsed) &&
		(kind != RunKindSimulation || activeDurationMs == nil ||
			*activeDurationMs <= p1SimulationDuration.Milliseconds())
}
