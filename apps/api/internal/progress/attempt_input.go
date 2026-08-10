package progress

import (
	"time"

	"github.com/google/uuid"
)

func normalizeAttempt(input RecordAttemptInput, now time.Time) (RecordAttemptInput, error) {
	if input.ID == uuid.Nil || (input.RunItemID == nil) == (input.Standalone == nil) {
		return RecordAttemptInput{}, invalidInput("target")
	}
	if !validOutcome(input.Outcome) || !validGradingKind(input.GradingKind) {
		return RecordAttemptInput{}, invalidInput("grading")
	}
	if input.HelpLevel < 0 || input.HelpLevel > 3 || !validAnswer(input.Answer) {
		return RecordAttemptInput{}, invalidInput("attempt")
	}
	if input.ActiveDurationMs != nil && *input.ActiveDurationMs < 0 {
		return RecordAttemptInput{}, invalidInput("activeDurationMs")
	}
	startedAt, err := normalizeClientTime(input.StartedAt, now, "startedAt")
	if err != nil {
		return RecordAttemptInput{}, err
	}
	submittedAt, err := normalizeClientTime(input.SubmittedAt, now, "submittedAt")
	if err != nil {
		return RecordAttemptInput{}, err
	}
	if submittedAt.Before(startedAt) {
		return RecordAttemptInput{}, invalidInput("submittedAt")
	}
	input.StartedAt = startedAt
	input.SubmittedAt = submittedAt
	return input, nil
}

func validateAttemptScore(outcome AttemptOutcome, earned, maximum *int16) error {
	if maximum != nil && (*maximum < 0 || *maximum > 60) {
		return invalidInput("maxPoints")
	}
	if earned != nil {
		if maximum == nil || *earned < 0 || *earned > *maximum {
			return invalidInput("earnedPoints")
		}
	}
	switch outcome {
	case AttemptOutcomeCorrect:
		if earned != nil && *earned != *maximum {
			return invalidInput("earnedPoints")
		}
	case AttemptOutcomeIncorrect:
		if earned != nil && *earned != 0 {
			return invalidInput("earnedPoints")
		}
	case AttemptOutcomePartial:
		if earned == nil || maximum == nil || *earned <= 0 || *earned >= *maximum {
			return invalidInput("earnedPoints")
		}
	case AttemptOutcomeSkipped, AttemptOutcomeUngraded:
		if earned != nil {
			return invalidInput("earnedPoints")
		}
	}
	return nil
}
