package graph

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

func TestGraphRunSummaryUsesLatestAttemptPerItem(t *testing.T) {
	runID := uuid.New()
	userID := uuid.New()
	itemID := uuid.New()
	incorrect := string(progress.AttemptOutcomeIncorrect)
	partial := string(progress.AttemptOutcomePartial)
	auto := string(progress.GradingKindAuto)
	rubric := string(progress.GradingKindRubricSelf)
	zero := int16(0)
	three := int16(3)
	maximum := int16(6)
	aggregate := progress.RunAggregate{
		Run: progress.Run{
			ID: runID, UserID: userID, Kind: string(progress.RunKindSimulation),
			Status: string(progress.RunStatusSubmitted), BlueprintVersion: "ftn-p1:2026.1",
			ContentRevision: "sha256:" + strings.Repeat("a", 64), StartedAt: time.Now().UTC(),
		},
		Items: []progress.RunItem{{
			ID: itemID, RunID: runID, UserID: userID, TaskID: "task-1",
			Ordinal: 1, ExamPosition: 1, Topic: "algebra", MaxPoints: &maximum,
		}},
		Attempts: []progress.Attempt{
			{
				PublicID: uuid.New(), UserID: userID,
				RunItemID: pgtype.UUID{Bytes: itemID, Valid: true},
				Outcome:   &incorrect, GradingKind: &auto, EarnedPoints: &zero,
			},
			{
				PublicID: uuid.New(), UserID: userID,
				RunItemID: pgtype.UUID{Bytes: itemID, Valid: true},
				Outcome:   &partial, GradingKind: &rubric, EarnedPoints: &three,
			},
		},
	}

	summary, err := graphRunSummary(aggregate)
	if err != nil {
		t.Fatal(err)
	}
	if summary.ItemCount != 1 || summary.CompletedItemCount != 1 ||
		summary.CorrectItemCount != 0 || summary.EarnedPoints == nil ||
		*summary.EarnedPoints != 3 || summary.MaxPoints == nil || *summary.MaxPoints != 6 {
		t.Fatalf("unexpected summary: %+v", summary)
	}
}

func TestGraphAttemptPreservesUnknownLegacyRevision(t *testing.T) {
	attempt, err := graphAttempt(progress.Attempt{
		PublicID:  uuid.New(),
		TaskID:    "legacy-001",
		Slot:      1,
		Correct:   true,
		Source:    string(progress.RunKindPractice),
		CreatedAt: time.Now().UTC(),
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if attempt.TaskRevision != nil {
		t.Fatalf("legacy revision was invented: %q", *attempt.TaskRevision)
	}
}
