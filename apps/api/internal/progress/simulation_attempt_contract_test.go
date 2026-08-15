package progress

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestSnapshottedSimulationAttemptContract(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*RecordAttemptInput, int16)
	}{
		{"random attempt id", func(input *RecordAttemptInput, _ int16) { input.ID = uuid.New() }},
		{"later start", func(input *RecordAttemptInput, _ int16) { input.StartedAt = input.StartedAt.Add(time.Second) }},
		{"plain answer", func(input *RecordAttemptInput, _ int16) { answer := "42"; input.Answer = &answer }},
		{"wrong answer part count", func(input *RecordAttemptInput, _ int16) { answer := `["42","24"]`; input.Answer = &answer }},
		{"help used", func(input *RecordAttemptInput, _ int16) { input.HelpLevel = 1 }},
		{"auto partial", func(input *RecordAttemptInput, _ int16) {
			points := int16(3)
			input.Outcome = AttemptOutcomePartial
			input.EarnedPoints = &points
		}},
		{"auto points omitted", func(input *RecordAttemptInput, _ int16) { input.EarnedPoints = nil }},
		{"rubric correct", func(input *RecordAttemptInput, maximum int16) {
			input.ID = simulationRubricAttemptID(*input.RunItemID)
			input.GradingKind = GradingKindRubricSelf
			input.EarnedPoints = &maximum
		}},
		{"skipped answer retained", func(input *RecordAttemptInput, _ int16) {
			input.Outcome = AttemptOutcomeSkipped
			input.EarnedPoints = nil
		}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			service := NewService(testPool)
			userID := seedProgressUser(t, "")
			run := snapshottedSimulationRun()
			if _, err := service.StartRun(ctx, userID, run); err != nil {
				t.Fatal(err)
			}

			attempt := correctSimulationAttempt(run, 0, run.StartedAt.Add(20*time.Minute))
			test.mutate(&attempt, *run.Items[0].MaxPoints)
			if _, err := service.RecordAttempt(ctx, userID, attempt); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}

	t.Run("valid auto and rubric payloads", func(t *testing.T) {
		ctx := context.Background()
		service := NewService(testPool)
		userID := seedProgressUser(t, "")
		run := snapshottedSimulationRun()
		if _, err := service.StartRun(ctx, userID, run); err != nil {
			t.Fatal(err)
		}
		submittedAt := run.StartedAt.Add(20 * time.Minute)
		rubricBeforeAuto := rubricSimulationAttempt(run, 1, submittedAt, 3)
		if _, err := service.RecordAttempt(ctx, userID, rubricBeforeAuto); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("rubric without auto: got %v", err)
		}
		auto := incorrectSimulationAttempt(run, 0, submittedAt)
		if _, err := service.RecordAttempt(ctx, userID, auto); err != nil {
			t.Fatalf("valid auto attempt: %v", err)
		}
		rubric := rubricSimulationAttempt(run, 0, submittedAt, 3)
		if _, err := service.RecordAttempt(ctx, userID, rubric); err != nil {
			t.Fatalf("valid rubric attempt: %v", err)
		}
	})
}

func TestSnapshottedSimulationSubmissionContract(t *testing.T) {
	tests := []struct {
		name    string
		record  func(context.Context, *testing.T, *Service, uuid.UUID, StartRunInput, time.Time)
		wantErr bool
	}{
		{
			name: "missing item attempt",
			record: func(ctx context.Context, t *testing.T, service *Service, userID uuid.UUID, run StartRunInput, submittedAt time.Time) {
				recordSkippedSimulationAttempts(ctx, t, service, userID, run, submittedAt, len(run.Items)-1)
			},
			wantErr: true,
		},
		{
			name: "mixed frozen submission times",
			record: func(ctx context.Context, t *testing.T, service *Service, userID uuid.UUID, run StartRunInput, submittedAt time.Time) {
				recordSkippedSimulationAttempts(ctx, t, service, userID, run, submittedAt, len(run.Items)-1)
				attempt := skippedSimulationAttempt(run, len(run.Items)-1, submittedAt.Add(-time.Second))
				if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
					t.Fatal(err)
				}
			},
			wantErr: true,
		},
		{
			name: "one final attempt per item",
			record: func(ctx context.Context, t *testing.T, service *Service, userID uuid.UUID, run StartRunInput, submittedAt time.Time) {
				recordSkippedSimulationAttempts(ctx, t, service, userID, run, submittedAt, len(run.Items))
			},
		},
		{
			name: "matching auto and rubric pair",
			record: func(ctx context.Context, t *testing.T, service *Service, userID uuid.UUID, run StartRunInput, submittedAt time.Time) {
				for _, attempt := range []RecordAttemptInput{
					incorrectSimulationAttempt(run, 0, submittedAt),
					rubricSimulationAttempt(run, 0, submittedAt, 3),
				} {
					if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
						t.Fatal(err)
					}
				}
				recordSkippedSimulationAttemptsFrom(ctx, t, service, userID, run, submittedAt, 1)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			ctx := context.Background()
			service := NewService(testPool)
			userID := seedProgressUser(t, "")
			run := snapshottedSimulationRun()
			if _, err := service.StartRun(ctx, userID, run); err != nil {
				t.Fatal(err)
			}
			submittedAt := run.StartedAt.Add(20 * time.Minute)
			test.record(ctx, t, service, userID, run, submittedAt)

			_, err := service.SubmitRun(ctx, userID, SubmitRunInput{
				ID: run.ID, SubmittedAt: submittedAt,
			})
			if test.wantErr {
				if !errors.Is(err, ErrInvalidInput) {
					t.Fatalf("got %v", err)
				}
				loaded, loadErr := service.GetRun(ctx, userID, run.ID)
				if loadErr != nil {
					t.Fatal(loadErr)
				}
				if loaded.Run.Status != string(RunStatusActive) {
					t.Fatalf("invalid submission changed status to %q", loaded.Run.Status)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestSnapshottedSimulationSubmissionRejectsPartialStoredSnapshot(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedSimulationRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(ctx, `
		update run_items set answer_part_count = null
		where id = $1 and user_id = $2
	`, run.Items[0].ID, userID); err != nil {
		t.Fatal(err)
	}

	_, err := service.SubmitRun(ctx, userID, SubmitRunInput{
		ID: run.ID, SubmittedAt: run.StartedAt.Add(20 * time.Minute),
	})
	if !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v", err)
	}
}

func TestRecordAttemptSerializesWithRunSubmissionLock(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := snapshottedSimulationRun()
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	lockTx, err := testPool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	locked := true
	t.Cleanup(func() {
		if locked {
			_ = lockTx.Rollback(ctx)
		}
	})
	if _, err := service.queries.WithTx(lockTx).GetRunForUpdate(ctx, GetRunForUpdateParams{
		ID: run.ID, UserID: userID,
	}); err != nil {
		t.Fatal(err)
	}

	attempt := incorrectSimulationAttempt(run, 0, run.StartedAt.Add(20*time.Minute))
	blockedCtx, cancel := context.WithTimeout(ctx, 250*time.Millisecond)
	defer cancel()
	if _, err := service.RecordAttempt(blockedCtx, userID, attempt); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("attempt did not wait for the run write lock: %v", err)
	}
	if err := lockTx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	locked = false

	if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
		t.Fatalf("attempt failed after the run lock was released: %v", err)
	}
}

func TestStartRunKeepsLegacyAnswerPartSnapshotsNullable(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	legacy := deterministicSimulationRun()
	if _, err := service.StartRun(ctx, userID, legacy); err != nil {
		t.Fatal(err)
	}

	enriched := legacy
	enriched.Items = append([]NewRunItem(nil), legacy.Items...)
	for index := range enriched.Items {
		count := int16(index%2 + 1)
		enriched.Items[index].AnswerPartCount = &count
	}
	retried, err := service.StartRun(ctx, userID, enriched)
	if err != nil {
		t.Fatal(err)
	}
	for index, item := range retried.Items {
		if item.AnswerPartCount != nil {
			t.Fatalf("legacy item %d was upgraded in place: %+v", index, item)
		}
	}
	if _, err := service.StartRun(ctx, userID, legacy); err != nil {
		t.Fatalf("legacy retry failed: %v", err)
	}
	if _, err := service.StartRun(ctx, userID, enriched); err != nil {
		t.Fatalf("snapshotted retry of legacy run failed: %v", err)
	}
}

func TestStartRunRejectsChangedAnswerPartSnapshot(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	enriched := snapshottedSimulationRun()
	if _, err := service.StartRun(ctx, userID, enriched); err != nil {
		t.Fatal(err)
	}

	legacy := enriched
	legacy.Items = append([]NewRunItem(nil), enriched.Items...)
	for index := range legacy.Items {
		legacy.Items[index].AnswerPartCount = nil
	}
	if _, err := service.StartRun(ctx, userID, legacy); err != nil {
		t.Fatalf("legacy retry of snapshotted run failed: %v", err)
	}

	changed := enriched
	changed.Items = append([]NewRunItem(nil), enriched.Items...)
	count := int16(3)
	changed.Items[0].AnswerPartCount = &count
	if _, err := service.StartRun(ctx, userID, changed); !errors.Is(err, ErrConflict) {
		t.Fatalf("changed snapshot: got %v", err)
	}
}

func TestStartRunRejectsPartialOrInvalidAnswerPartSnapshots(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*StartRunInput)
	}{
		{"partial snapshot", func(input *StartRunInput) { input.Items[0].AnswerPartCount = nil }},
		{"zero parts", func(input *StartRunInput) { zero := int16(0); input.Items[0].AnswerPartCount = &zero }},
		{"too many parts", func(input *StartRunInput) { count := int16(7); input.Items[0].AnswerPartCount = &count }},
		{"non-deterministic item id", func(input *StartRunInput) { input.Items[0].ID = uuid.New() }},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := NewService(testPool)
			userID := seedProgressUser(t, "")
			run := snapshottedSimulationRun()
			test.mutate(&run)
			if _, err := service.StartRun(context.Background(), userID, run); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func snapshottedSimulationRun() StartRunInput {
	run := deterministicSimulationRun()
	for index := range run.Items {
		count := int16(1)
		run.Items[index].AnswerPartCount = &count
	}
	return run
}

func deterministicSimulationRun() StartRunInput {
	run := sampleRunInput(RunKindSimulation)
	for index := range run.Items {
		run.Items[index].ID = uuid.NewSHA1(run.ID, []byte("run-item:"+run.Items[index].TaskID))
	}
	return run
}

func correctSimulationAttempt(run StartRunInput, index int, submittedAt time.Time) RecordAttemptInput {
	answer := `["42"]`
	maximum := *run.Items[index].MaxPoints
	return RecordAttemptInput{
		ID:           simulationAutoAttemptID(run.Items[index].ID),
		RunItemID:    &run.Items[index].ID,
		StartedAt:    run.StartedAt,
		SubmittedAt:  submittedAt,
		Answer:       &answer,
		Outcome:      AttemptOutcomeCorrect,
		GradingKind:  GradingKindAuto,
		EarnedPoints: &maximum,
	}
}

func incorrectSimulationAttempt(run StartRunInput, index int, submittedAt time.Time) RecordAttemptInput {
	attempt := correctSimulationAttempt(run, index, submittedAt)
	zero := int16(0)
	attempt.Outcome = AttemptOutcomeIncorrect
	attempt.EarnedPoints = &zero
	return attempt
}

func skippedSimulationAttempt(run StartRunInput, index int, submittedAt time.Time) RecordAttemptInput {
	return RecordAttemptInput{
		ID:          simulationAutoAttemptID(run.Items[index].ID),
		RunItemID:   &run.Items[index].ID,
		StartedAt:   run.StartedAt,
		SubmittedAt: submittedAt,
		Outcome:     AttemptOutcomeSkipped,
		GradingKind: GradingKindAuto,
	}
}

func rubricSimulationAttempt(run StartRunInput, index int, submittedAt time.Time, points int16) RecordAttemptInput {
	answer := `["42"]`
	return RecordAttemptInput{
		ID:           simulationRubricAttemptID(run.Items[index].ID),
		RunItemID:    &run.Items[index].ID,
		StartedAt:    run.StartedAt,
		SubmittedAt:  submittedAt,
		Answer:       &answer,
		Outcome:      AttemptOutcomePartial,
		GradingKind:  GradingKindRubricSelf,
		EarnedPoints: &points,
	}
}

func recordSkippedSimulationAttempts(
	ctx context.Context,
	t *testing.T,
	service *Service,
	userID uuid.UUID,
	run StartRunInput,
	submittedAt time.Time,
	count int,
) {
	t.Helper()
	for index := 0; index < count; index++ {
		attempt := skippedSimulationAttempt(run, index, submittedAt)
		if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
			t.Fatalf("item %d: %v", index, err)
		}
	}
}

func recordSkippedSimulationAttemptsFrom(
	ctx context.Context,
	t *testing.T,
	service *Service,
	userID uuid.UUID,
	run StartRunInput,
	submittedAt time.Time,
	start int,
) {
	t.Helper()
	for index := start; index < len(run.Items); index++ {
		attempt := skippedSimulationAttempt(run, index, submittedAt)
		if _, err := service.RecordAttempt(ctx, userID, attempt); err != nil {
			t.Fatalf("item %d: %v", index, err)
		}
	}
}

func TestSimulationIDsMatchWebUUIDv5(t *testing.T) {
	runID := uuid.MustParse("5ff78318-3436-4b4e-99b8-77ef34366ad3")
	if got := runItemSnapshotID(runID, "task-1").String(); got != "7069057e-b2fe-52b7-a933-b623398eb4ea" {
		t.Fatalf("run item id = %s", got)
	}
	itemID := uuid.MustParse("239d709c-bc13-5e11-bac2-65e22b5c1c1d")
	if got := simulationAutoAttemptID(itemID).String(); got != "a64adf9f-1dc7-5eec-ba21-8dd43fb21963" {
		t.Fatalf("auto id = %s", got)
	}
	if got := simulationRubricAttemptID(itemID).String(); got != "b9f4760a-c274-52b9-ac0d-b9a29aa60753" {
		t.Fatalf("rubric id = %s", got)
	}
}

func TestSimulationAnswerBlankMatchesJavaScriptTrim(t *testing.T) {
	tests := []struct {
		value string
		blank bool
	}{
		{"", true},
		{" \t\r\n", true},
		{"\u00a0\u2007\u202f", true},
		{"\ufeff", true},
		{"\u0085", false},
		{" x ", false},
	}
	for _, test := range tests {
		if got := simulationAnswerPartBlank(test.value); got != test.blank {
			t.Fatalf("blank(%q) = %v, want %v", test.value, got, test.blank)
		}
	}
}
