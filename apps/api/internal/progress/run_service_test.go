package progress

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

func TestRunLifecycleRoundTrip(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	input := sampleRunInput(RunKindDiagnostic)

	started, err := service.StartRun(ctx, userID, input)
	if err != nil {
		t.Fatal(err)
	}
	if started.Run.Status != string(RunStatusActive) || len(started.Items) != 2 || len(started.Attempts) != 0 {
		t.Fatalf("unexpected started run: %+v", started)
	}

	retried, err := service.StartRun(ctx, userID, input)
	if err != nil {
		t.Fatal(err)
	}
	if retried.Run.ID != started.Run.ID || len(retried.Items) != 2 {
		t.Fatalf("idempotent start changed run: %+v", retried)
	}

	answer := "2"
	activeDuration := int64(42_000)
	earnedPoints := int16(3)
	attemptInput := RecordAttemptInput{
		ID:               uuid.New(),
		RunItemID:        &input.Items[0].ID,
		StartedAt:        input.StartedAt.Add(time.Minute),
		SubmittedAt:      input.StartedAt.Add(2 * time.Minute),
		ActiveDurationMs: &activeDuration,
		Answer:           &answer,
		Outcome:          AttemptOutcomePartial,
		HelpLevel:        1,
		GradingKind:      GradingKindRubricSelf,
		EarnedPoints:     &earnedPoints,
	}
	attempt, err := service.RecordAttempt(ctx, userID, attemptInput)
	if err != nil {
		t.Fatal(err)
	}
	if attempt.PublicID != attemptInput.ID || attempt.Correct || attempt.Outcome == nil ||
		*attempt.Outcome != string(AttemptOutcomePartial) || attempt.EarnedPoints == nil ||
		*attempt.EarnedPoints != earnedPoints {
		t.Fatalf("unexpected attempt: %+v", attempt)
	}

	attemptRetry, err := service.RecordAttempt(ctx, userID, attemptInput)
	if err != nil {
		t.Fatal(err)
	}
	if attemptRetry.ID != attempt.ID {
		t.Fatalf("attempt duplicated: %d != %d", attemptRetry.ID, attempt.ID)
	}

	submittedAt := input.StartedAt.Add(20 * time.Minute)
	duration := int64(18 * time.Minute / time.Millisecond)
	submitted, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:               input.ID,
		SubmittedAt:      submittedAt,
		ActiveDurationMs: &duration,
	})
	if err != nil {
		t.Fatal(err)
	}
	if submitted.Run.Status != string(RunStatusSubmitted) || submitted.Run.DurationMs == nil ||
		*submitted.Run.DurationMs != duration || len(submitted.Attempts) != 1 {
		t.Fatalf("unexpected submitted run: %+v", submitted)
	}

	if _, err := service.RecordAttempt(ctx, userID, attemptInput); err != nil {
		t.Fatalf("saved attempt retry after submit failed: %v", err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{ID: input.ID}); err != nil {
		t.Fatalf("submit retry failed: %v", err)
	}

	newAttempt := attemptInput
	newAttempt.ID = uuid.New()
	if _, err := service.RecordAttempt(ctx, userID, newAttempt); !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("new attempt after submit: got %v", err)
	}

	loaded, err := service.GetRun(ctx, userID, input.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Items) != 2 || len(loaded.Attempts) != 1 {
		t.Fatalf("run was not reconstructed: %+v", loaded)
	}
	runs, err := service.ListRuns(ctx, userID, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 || runs[0].ID != input.ID {
		t.Fatalf("run list mismatch: %+v", runs)
	}
}

func TestRunDataIsScopedToUser(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	ownerID := seedProgressUser(t, "-owner")
	otherID := seedProgressUser(t, "-other")
	input := sampleRunInput(RunKindPractice)

	if _, err := service.StartRun(ctx, ownerID, input); err != nil {
		t.Fatal(err)
	}
	if _, err := service.GetRun(ctx, otherID, input.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-user run read: got %v", err)
	}
	if _, err := service.StartRun(ctx, otherID, input); !errors.Is(err, ErrConflict) {
		t.Fatalf("cross-user run id reuse: got %v", err)
	}

	attempt := sampleAttemptInput(input.Items[0].ID, input.StartedAt)
	if _, err := service.RecordAttempt(ctx, otherID, attempt); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-user run item write: got %v", err)
	}
	runs, err := service.ListRuns(ctx, otherID, 20)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 0 {
		t.Fatalf("cross-user runs leaked: %+v", runs)
	}
}

func TestAttemptClientIDRejectsDifferentPayload(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	input := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, input); err != nil {
		t.Fatal(err)
	}

	attempt := sampleAttemptInput(input.Items[0].ID, input.StartedAt)
	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatal(err)
	}
	changed := "different"
	attempt.Answer = &changed
	if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed idempotent payload: got %v", err)
	}

	loaded, err := service.GetRun(ctx, userID, input.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Attempts) != 1 || loaded.Attempts[0].Answer == nil || *loaded.Attempts[0].Answer != "42" {
		t.Fatalf("conflict changed stored attempt: %+v", loaded.Attempts)
	}
}

func TestStartRunRollsBackOnRunItemConflict(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	first := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, first); err != nil {
		t.Fatal(err)
	}

	second := sampleRunInput(RunKindPractice)
	second.Items[1].ID = first.Items[0].ID
	if _, err := service.StartRun(ctx, userID, second); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate item id: got %v", err)
	}
	if _, err := service.GetRun(ctx, userID, second.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("failed start was not rolled back: got %v", err)
	}
}

func TestRunInputValidation(t *testing.T) {
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	base := sampleRunInput(RunKindSimulation)

	tests := []struct {
		name   string
		mutate func(*StartRunInput)
	}{
		{"missing id", func(input *StartRunInput) { input.ID = uuid.Nil }},
		{"unknown kind", func(input *StartRunInput) { input.Kind = "quiz" }},
		{"no items", func(input *StartRunInput) { input.Items = nil }},
		{"duplicate task", func(input *StartRunInput) { input.Items[1].TaskID = input.Items[0].TaskID }},
		{"duplicate position", func(input *StartRunInput) { input.Items[1].ExamPosition = input.Items[0].ExamPosition }},
		{"missing simulation points", func(input *StartRunInput) { input.Items[0].MaxPoints = nil }},
		{"zero point ceiling", func(input *StartRunInput) {
			zero := int16(0)
			input.Items[0].MaxPoints = &zero
		}},
		{"future start", func(input *StartRunInput) { input.StartedAt = time.Now().Add(time.Hour) }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := base
			input.ID = uuid.New()
			input.Items = append([]NewRunItem(nil), base.Items...)
			test.mutate(&input)
			if _, err := service.StartRun(context.Background(), userID, input); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func seedProgressUser(t *testing.T, suffix string) uuid.UUID {
	t.Helper()
	user, err := auth.New(testPool).UpsertUser(context.Background(), auth.UpsertUserParams{
		GoogleSub: "run-" + t.Name() + suffix,
		Email:     strings.ToLower(strings.ReplaceAll(t.Name(), "/", "-")) + suffix + "@example.com",
		Name:      "Run Test",
	})
	if err != nil {
		t.Fatal(err)
	}
	return user.ID
}

func sampleRunInput(kind RunKind) StartRunInput {
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	deadline := startedAt.Add(4 * time.Hour)
	firstPoints := int16(6)
	secondPoints := int16(6)
	return StartRunInput{
		ID:               uuid.New(),
		Kind:             kind,
		BlueprintVersion: "ftn-p1-2026.1",
		ContentRevision:  "content-revision",
		StartedAt:        startedAt,
		DeadlineAt:       &deadline,
		Items: []NewRunItem{
			{
				ID:           uuid.New(),
				TaskID:       "log-001",
				ExamPosition: 3,
				Topic:        "logaritmi",
				MaxPoints:    &firstPoints,
				TaskRevision: "task-revision-one",
			},
			{
				ID:           uuid.New(),
				TaskID:       "eks-001",
				ExamPosition: 4,
				Topic:        "eksponencijalne",
				MaxPoints:    &secondPoints,
				TaskRevision: "task-revision-two",
			},
		},
	}
}

func sampleAttemptInput(runItemID uuid.UUID, startedAt time.Time) RecordAttemptInput {
	answer := "42"
	return RecordAttemptInput{
		ID:          uuid.New(),
		RunItemID:   &runItemID,
		StartedAt:   startedAt.Add(time.Minute),
		SubmittedAt: startedAt.Add(2 * time.Minute),
		Answer:      &answer,
		Outcome:     AttemptOutcomeCorrect,
		GradingKind: GradingKindAuto,
	}
}
