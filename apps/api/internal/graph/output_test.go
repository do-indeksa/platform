package graph

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

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
