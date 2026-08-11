package progress

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestAttemptJournalPreservesRichAndLegacyRows(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	ownerID := seedProgressUser(t, "-owner")
	otherID := seedProgressUser(t, "-other")
	startedAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)

	if err := service.Record(ctx, ownerID, []InsertAttemptsParams{{
		TaskID:    "legacy-001",
		Slot:      1,
		Correct:   false,
		Source:    string(RunKindPractice),
		HelpLevel: 2,
		CreatedAt: startedAt,
	}}); err != nil {
		t.Fatal(err)
	}

	answer := "42"
	duration := int64(time.Minute / time.Millisecond)
	richID := uuid.New()
	rich, err := service.RecordAttempt(ctx, ownerID, RecordAttemptInput{
		ID: richID,
		Standalone: &StandaloneAttemptTarget{
			TaskID:       "rich-001",
			ExamPosition: 2,
			TaskRevision: "sha256:rich",
		},
		StartedAt:        startedAt.Add(9 * time.Minute),
		SubmittedAt:      startedAt.Add(10 * time.Minute),
		ActiveDurationMs: &duration,
		Answer:           &answer,
		Outcome:          AttemptOutcomeCorrect,
		HelpLevel:        1,
		GradingKind:      GradingKindAuto,
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, err := service.RecordAttempt(ctx, otherID, RecordAttemptInput{
		ID: uuid.New(),
		Standalone: &StandaloneAttemptTarget{
			TaskID:       "other-001",
			ExamPosition: 3,
			TaskRevision: "sha256:other",
		},
		StartedAt:   startedAt.Add(19 * time.Minute),
		SubmittedAt: startedAt.Add(20 * time.Minute),
		Outcome:     AttemptOutcomeIncorrect,
		GradingKind: GradingKindAuto,
	}); err != nil {
		t.Fatal(err)
	}

	journal, err := service.ListAttemptJournal(ctx, ownerID, 100)
	if err != nil {
		t.Fatal(err)
	}
	if len(journal) != 2 || journal[0].TaskID != "legacy-001" || journal[1].PublicID != richID {
		t.Fatalf("unexpected journal order or ownership: %+v", journal)
	}
	if journal[0].TaskRevision != nil {
		t.Fatalf("legacy revision was invented: %q", *journal[0].TaskRevision)
	}
	if journal[1].Answer == nil || *journal[1].Answer != answer || journal[1].TaskRevision == nil ||
		*journal[1].TaskRevision != "sha256:rich" || rich.ID != journal[1].ID {
		t.Fatalf("rich attempt was not preserved: %+v", journal[1])
	}

	latest, err := service.ListAttemptJournal(ctx, ownerID, 1)
	if err != nil {
		t.Fatal(err)
	}
	if len(latest) != 1 || latest[0].PublicID != richID {
		t.Fatalf("limit kept the wrong attempt: %+v", latest)
	}
	for _, limit := range []int32{0, MaxAttemptJournalEntries + 1} {
		if _, err := service.ListAttemptJournal(ctx, ownerID, limit); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("limit %d: got %v", limit, err)
		}
	}
}
