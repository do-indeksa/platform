package progress

import "time"

type normalizedRunSubmission struct {
	submittedAt      time.Time
	activeDurationMs int64
}

func normalizeRunSubmission(
	run Run,
	input SubmitRunInput,
	now time.Time,
) (normalizedRunSubmission, error) {
	submittedAt, err := normalizeClientTime(input.SubmittedAt, now, "submittedAt")
	if err != nil {
		return normalizedRunSubmission{}, err
	}
	if submittedAt.Before(run.StartedAt) {
		return normalizedRunSubmission{}, invalidInput("submittedAt")
	}
	runKind := RunKind(run.Kind)
	if !validRunActiveDuration(runKind, input.ActiveDurationMs, submittedAt.Sub(run.StartedAt)) {
		return normalizedRunSubmission{}, invalidInput("activeDurationMs")
	}
	activeDurationMs := submittedAt.Sub(run.StartedAt).Milliseconds()
	if input.ActiveDurationMs != nil {
		activeDurationMs = *input.ActiveDurationMs
	} else if runKind == RunKindSimulation && activeDurationMs > p1SimulationDuration.Milliseconds() {
		activeDurationMs = p1SimulationDuration.Milliseconds()
	}
	return normalizedRunSubmission{
		submittedAt:      submittedAt,
		activeDurationMs: activeDurationMs,
	}, nil
}

func sameRunSubmission(run Run, submission normalizedRunSubmission) bool {
	return run.SubmittedAt.Valid && run.DurationMs != nil &&
		run.SubmittedAt.Time.Equal(submission.submittedAt) &&
		*run.DurationMs == submission.activeDurationMs
}
