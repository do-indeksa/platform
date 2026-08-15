package progress

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestStartRunRejectsDatabaseInvalidText(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	invalidUTF8 := string([]byte{'b', 'a', 'd', 0xff})

	tests := []struct {
		name   string
		mutate func(*StartRunInput)
	}{
		{
			name: "blueprint null byte",
			mutate: func(input *StartRunInput) {
				input.BlueprintVersion = "practice\x00v1"
			},
		},
		{
			name: "blueprint invalid utf8",
			mutate: func(input *StartRunInput) {
				input.BlueprintVersion = invalidUTF8
			},
		},
		{
			name: "content revision null byte",
			mutate: func(input *StartRunInput) {
				input.ContentRevision = "content\x00revision"
			},
		},
		{
			name: "content revision invalid utf8",
			mutate: func(input *StartRunInput) {
				input.ContentRevision = invalidUTF8
			},
		},
		{
			name: "task revision null byte",
			mutate: func(input *StartRunInput) {
				input.Items[0].TaskRevision = "task\x00revision"
			},
		},
		{
			name: "task revision invalid utf8",
			mutate: func(input *StartRunInput) {
				input.Items[0].TaskRevision = invalidUTF8
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			input := sampleRunInput(RunKindPractice)
			test.mutate(&input)
			if _, err := service.StartRun(ctx, userID, input); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}
}

func TestRecordAttemptRejectsDatabaseInvalidText(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindPractice)
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}
	invalidUTF8 := string([]byte{'b', 'a', 'd', 0xff})

	tests := []struct {
		name  string
		input func() RecordAttemptInput
	}{
		{
			name: "answer null byte",
			input: func() RecordAttemptInput {
				input := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
				answer := "before\x00after"
				input.Answer = &answer
				return input
			},
		},
		{
			name: "answer invalid utf8",
			input: func() RecordAttemptInput {
				input := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
				input.Answer = &invalidUTF8
				return input
			},
		},
		{
			name: "standalone revision null byte",
			input: func() RecordAttemptInput {
				target := StandaloneAttemptTarget{
					TaskID:       "log-001",
					ExamPosition: 3,
					TaskRevision: "task\x00revision",
				}
				return standaloneAttemptInput(&target, run.StartedAt)
			},
		},
		{
			name: "standalone revision invalid utf8",
			input: func() RecordAttemptInput {
				target := StandaloneAttemptTarget{
					TaskID:       "log-001",
					ExamPosition: 3,
					TaskRevision: invalidUTF8,
				}
				return standaloneAttemptInput(&target, run.StartedAt)
			},
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if _, err := service.RecordAttempt(ctx, userID, test.input()); !errors.Is(err, ErrInvalidInput) {
				t.Fatalf("got %v", err)
			}
		})
	}

	loaded, err := service.GetRun(ctx, userID, run.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Attempts) != 0 {
		t.Fatalf("invalid input created attempts: %+v", loaded.Attempts)
	}
}

func TestProgressTextValidationPreservesUnicodeAndEmptyAnswer(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	userID := seedProgressUser(t, "")
	run := sampleRunInput(RunKindPractice)
	run.BlueprintVersion = "vežba-v1"
	run.ContentRevision = "revizija-ž"
	run.Items[0].TaskRevision = "verzija-č"
	if _, err := service.StartRun(ctx, userID, run); err != nil {
		t.Fatal(err)
	}

	empty := ""
	first := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	first.Answer = &empty
	if _, err := service.RecordAttempt(ctx, userID, first); err != nil {
		t.Fatalf("empty answer: %v", err)
	}

	answer := "rešenje"
	second := sampleAttemptInput(run.Items[0].ID, run.StartedAt)
	second.Answer = &answer
	second.StartedAt = run.StartedAt.Add(3 * time.Minute)
	second.SubmittedAt = run.StartedAt.Add(4 * time.Minute)
	if _, err := service.RecordAttempt(ctx, userID, second); err != nil {
		t.Fatalf("unicode answer: %v", err)
	}
}

func standaloneAttemptInput(target *StandaloneAttemptTarget, startedAt time.Time) RecordAttemptInput {
	return RecordAttemptInput{
		ID:          uuid.New(),
		Standalone:  target,
		StartedAt:   startedAt.Add(time.Minute),
		SubmittedAt: startedAt.Add(2 * time.Minute),
		Outcome:     AttemptOutcomeUngraded,
		GradingKind: GradingKindAuto,
	}
}
