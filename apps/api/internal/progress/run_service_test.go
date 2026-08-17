package progress

import (
	"context"
	"errors"
	"fmt"
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
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID:               input.ID,
		SubmittedAt:      submittedAt,
		ActiveDurationMs: &duration,
	}); err != nil {
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
	if len(runs) != 1 || runs[0].Run.ID != input.ID || len(runs[0].Items) != 2 ||
		len(runs[0].Attempts) != 1 || runs[0].Attempts[0].PublicID != attemptInput.ID {
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

func TestCompletedSimulationArchiveIsFilteredAndOwnerScoped(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	ownerID := seedProgressUser(t, "-owner")
	otherID := seedProgressUser(t, "-other")

	archived := sampleRunInput(RunKindSimulation)
	firstAttempt := sampleAttemptInput(archived.Items[0].ID, archived.StartedAt)
	if _, err := service.StartRun(ctx, ownerID, archived); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecordAttempt(ctx, ownerID, firstAttempt); err != nil {
		t.Fatal(err)
	}
	latestAttempt := sampleAttemptInput(archived.Items[0].ID, archived.StartedAt)
	latestAnswer := "[\"latest\"]"
	latestAttempt.Answer = &latestAnswer
	latestAttempt.Outcome = AttemptOutcomeIncorrect
	latestAttempt.StartedAt = archived.StartedAt.Add(3 * time.Minute)
	latestAttempt.SubmittedAt = archived.StartedAt.Add(4 * time.Minute)
	if _, err := service.RecordAttempt(ctx, ownerID, latestAttempt); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, ownerID, SubmitRunInput{
		ID:          archived.ID,
		SubmittedAt: archived.StartedAt.Add(20 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}

	active := sampleRunInput(RunKindSimulation)
	if _, err := service.StartRun(ctx, ownerID, active); err != nil {
		t.Fatal(err)
	}
	practice := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, ownerID, practice); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, ownerID, SubmitRunInput{
		ID:          practice.ID,
		SubmittedAt: practice.StartedAt.Add(30 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update runs
		set kind = 'simulation',
		    blueprint_version = 'ftn-p1:2026.1',
		    content_revision = $3,
		    deadline_at = null
		where id = $1 and user_id = $2
	`, practice.ID, ownerID, "sha256:"+strings.Repeat("a", 64)); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update run_items
		set task_revision = $3
		where run_id = $1 and user_id = $2
	`, practice.ID, ownerID, "sha256:"+strings.Repeat("b", 64)); err != nil {
		t.Fatal(err)
	}
	overlong := sampleRunInput(RunKindSimulation)
	if _, err := service.StartRun(ctx, ownerID, overlong); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, ownerID, SubmitRunInput{
		ID:          overlong.ID,
		SubmittedAt: overlong.StartedAt.Add(20 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update runs
		set duration_ms = $3,
		    submitted_at = submitted_at + interval '1 second'
		where id = $1 and user_id = $2
	`, overlong.ID, ownerID, p1SimulationDuration.Milliseconds()+1); err != nil {
		t.Fatal(err)
	}
	other := sampleRunInput(RunKindSimulation)
	if _, err := service.StartRun(ctx, otherID, other); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, otherID, SubmitRunInput{
		ID:          other.ID,
		SubmittedAt: other.StartedAt.Add(20 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}

	runs, err := service.ListCompletedSimulationRuns(ctx, ownerID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 || runs[0].Run.ID != archived.ID || len(runs[0].Items) != P1TaskCount ||
		len(runs[0].Attempts) != 1 || runs[0].Attempts[0].Answer == nil ||
		*runs[0].Attempts[0].Answer != latestAnswer {
		t.Fatalf("unexpected completed simulation archive: %+v", runs)
	}
	if _, err := service.ListCompletedSimulationRuns(ctx, ownerID, MaxCompletedSimulationRuns+1); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("oversized archive limit: got %v", err)
	}
}

func TestCompletedSimulationArchiveFiltersCausallyInvalidLegacyRuns(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")

	valid := sampleRunInput(RunKindSimulation)
	if _, err := service.StartRun(ctx, userID, valid); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecordAttempt(ctx, userID, sampleAttemptInput(valid.Items[0].ID, valid.StartedAt)); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: valid.ID, SubmittedAt: valid.StartedAt.Add(20 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}

	beforeRun := sampleRunInput(RunKindSimulation)
	beforeAttempt := sampleAttemptInput(beforeRun.Items[0].ID, beforeRun.StartedAt)
	if _, err := service.StartRun(ctx, userID, beforeRun); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecordAttempt(ctx, userID, beforeAttempt); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: beforeRun.ID, SubmittedAt: beforeRun.StartedAt.Add(21 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update attempts
		set started_at = $3, submitted_at = $4
		where public_id = $1 and user_id = $2
	`, beforeAttempt.ID, userID, beforeRun.StartedAt.Add(-2*time.Minute), beforeRun.StartedAt.Add(-time.Minute)); err != nil {
		t.Fatal(err)
	}

	afterSubmit := sampleRunInput(RunKindSimulation)
	afterAttempt := sampleAttemptInput(afterSubmit.Items[0].ID, afterSubmit.StartedAt)
	if _, err := service.StartRun(ctx, userID, afterSubmit); err != nil {
		t.Fatal(err)
	}
	if _, err := service.RecordAttempt(ctx, userID, afterAttempt); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: afterSubmit.ID, SubmittedAt: afterSubmit.StartedAt.Add(22 * time.Minute),
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update attempts
		set started_at = $3, submitted_at = $4
		where public_id = $1 and user_id = $2
	`, afterAttempt.ID, userID, afterSubmit.StartedAt.Add(23*time.Minute), afterSubmit.StartedAt.Add(24*time.Minute)); err != nil {
		t.Fatal(err)
	}

	runs, err := service.ListCompletedSimulationRuns(ctx, userID, MaxCompletedSimulationRuns)
	if err != nil {
		t.Fatal(err)
	}
	if len(runs) != 1 || runs[0].Run.ID != valid.ID {
		t.Fatalf("archive retained causally invalid runs: %+v", runs)
	}
}

func TestStartRunCanonicalizesLegacySimulationDeadline(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindSimulation)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update runs set deadline_at = null where id = $1 and user_id = $2
	`, run.ID, userID); err != nil {
		t.Fatal(err)
	}

	retried, err := service.StartRun(ctx, userID, run)
	if err != nil {
		t.Fatal(err)
	}
	if !retried.Run.DeadlineAt.Valid || !retried.Run.DeadlineAt.Time.Equal(*run.DeadlineAt) {
		t.Fatalf("legacy simulation deadline was not canonicalized: %+v", retried.Run.DeadlineAt)
	}
	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !loaded.Run.DeadlineAt.Valid || !loaded.Run.DeadlineAt.Time.Equal(*run.DeadlineAt) {
		t.Fatalf("canonical deadline was not persisted: %+v", loaded.Run.DeadlineAt)
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

func TestGetRunLimitsRecentAttemptsPerItem(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	for i := 0; i < int(MaxRecentRunItemAttempts)+5; i++ {
		attempt := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
		answer := fmt.Sprintf("answer-%02d", i)
		attempt.Answer = &answer
		attempt.StartedAt = run.StartedAt.Add(time.Duration(i+1) * time.Minute)
		attempt.SubmittedAt = attempt.StartedAt.Add(time.Second)
		if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
			t.Fatal(err)
		}
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Attempts) != int(MaxRecentRunItemAttempts) {
		t.Fatalf("got %d attempts", len(loaded.Attempts))
	}
	first := loaded.Attempts[0].Answer
	last := loaded.Attempts[len(loaded.Attempts)-1].Answer
	if first == nil || last == nil || *first != "answer-05" || *last != "answer-24" {
		t.Fatalf("unexpected recent window: first=%v last=%v", first, last)
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
		{"wrong simulation blueprint", func(input *StartRunInput) { input.BlueprintVersion = "ftn-p1-2026.1" }},
		{"mutable content revision", func(input *StartRunInput) { input.ContentRevision = "mutable" }},
		{"wrong simulation deadline", func(input *StartRunInput) {
			deadline := input.StartedAt.Add(p1SimulationDuration - time.Second)
			input.DeadlineAt = &deadline
		}},
		{"no items", func(input *StartRunInput) { input.Items = nil }},
		{"incomplete simulation", func(input *StartRunInput) { input.Items = input.Items[:len(input.Items)-1] }},
		{"duplicate task", func(input *StartRunInput) { input.Items[1].TaskID = input.Items[0].TaskID }},
		{"duplicate position", func(input *StartRunInput) { input.Items[1].ExamPosition = input.Items[0].ExamPosition }},
		{"permuted position", func(input *StartRunInput) {
			input.Items[0].ExamPosition, input.Items[1].ExamPosition = input.Items[1].ExamPosition, input.Items[0].ExamPosition
		}},
		{"mutable task revision", func(input *StartRunInput) { input.Items[0].TaskRevision = "mutable" }},
		{"missing simulation points", func(input *StartRunInput) { input.Items[0].MaxPoints = nil }},
		{"incomplete point ceiling", func(input *StartRunInput) {
			points := int16(5)
			input.Items[0].MaxPoints = &points
		}},
		{"excessive point ceiling", func(input *StartRunInput) {
			points := int16(7)
			input.Items[0].MaxPoints = &points
		}},
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

func TestStartRunDerivesMissingSimulationDeadline(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindSimulation)
	run.DeadlineAt = nil

	started, err := service.StartRun(ctx, userID, run)
	if err != nil {
		t.Fatal(err)
	}
	expected := run.StartedAt.Add(p1SimulationDuration)
	if !started.Run.DeadlineAt.Valid || !started.Run.DeadlineAt.Time.Equal(expected) {
		t.Fatalf("missing simulation deadline was not derived: %+v", started.Run.DeadlineAt)
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
	input := StartRunInput{
		ID:               uuid.New(),
		Kind:             kind,
		BlueprintVersion: "diagnostic-v1",
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
	if kind != RunKindSimulation {
		return input
	}
	input.BlueprintVersion = "ftn-p1:2026.1"
	input.ContentRevision = "sha256:" + strings.Repeat("a", 64)
	input.Items = make([]NewRunItem, P1TaskCount)
	for index := range input.Items {
		points := int16(6)
		input.Items[index] = NewRunItem{
			ID:           uuid.New(),
			TaskID:       fmt.Sprintf("task-%d", index+1),
			ExamPosition: int16(index + 1),
			Topic:        fmt.Sprintf("topic-%d", index+1),
			MaxPoints:    &points,
			TaskRevision: "sha256:" + strings.Repeat(fmt.Sprintf("%x", index), 64),
		}
	}
	return input
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
