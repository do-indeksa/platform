package progress

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestLatestSubmittedDiagnosticRunIsOwnerScopedAndIndependentOfHistoryLimit(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	ownerID := seedProgressUser(t, "-owner")
	otherID := seedProgressUser(t, "-other")
	emptyOwnerID := seedProgressUser(t, "-empty")
	base := time.Now().Add(-8 * time.Hour).UTC().Truncate(time.Microsecond)

	older := submittedDiagnostic(t, service, ownerID, base)
	latest := submittedDiagnostic(t, service, ownerID, base.Add(time.Hour))
	active := sampleRunInput(RunKindDiagnostic)
	active.StartedAt = base.Add(2 * time.Hour)
	if _, err := service.StartRun(ctx, ownerID, active); err != nil {
		t.Fatal(err)
	}
	abandoned := sampleRunInput(RunKindDiagnostic)
	abandoned.StartedAt = base.Add(3 * time.Hour)
	if _, err := service.StartRun(ctx, ownerID, abandoned); err != nil {
		t.Fatal(err)
	}
	if _, err := service.AbandonRun(ctx, ownerID, AbandonRunInput{ID: abandoned.ID}); err != nil {
		t.Fatal(err)
	}
	other := submittedDiagnostic(t, service, otherID, base.Add(4*time.Hour))

	if _, err := testPool.Exec(ctx, `
		insert into runs (
			id, user_id, kind, status, blueprint_version, content_revision, started_at
		)
		select gen_random_uuid(), $1, 'practice', 'active', 'practice-v1',
		       'content-revision', $2::timestamptz + series.position * interval '1 minute'
		from generate_series(0, 100) as series(position)
	`, ownerID, base.Add(5*time.Hour)); err != nil {
		t.Fatal(err)
	}
	recent, err := service.ListRuns(ctx, ownerID, 100)
	if err != nil {
		t.Fatal(err)
	}
	for _, run := range recent {
		if run.Run.ID == latest.Run.ID || run.Run.ID == older.Run.ID {
			t.Fatalf("submitted diagnostic unexpectedly remained inside bounded history: %s", run.Run.ID)
		}
	}

	marker, err := service.LatestSubmittedDiagnosticRun(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if marker.ID != latest.Run.ID || !marker.SubmittedAt.Valid ||
		!marker.SubmittedAt.Time.Equal(latest.Run.SubmittedAt.Time) {
		t.Fatalf("unexpected owner marker: %+v", marker)
	}
	otherMarker, err := service.LatestSubmittedDiagnosticRun(ctx, otherID)
	if err != nil {
		t.Fatal(err)
	}
	if otherMarker.ID != other.Run.ID {
		t.Fatalf("owner marker leaked across users: %+v", otherMarker)
	}
	if _, err := service.LatestSubmittedDiagnosticRun(ctx, emptyOwnerID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty owner marker: got %v", err)
	}
}

func submittedDiagnostic(
	t *testing.T,
	service *Service,
	ownerID uuid.UUID,
	startedAt time.Time,
) RunAggregate {
	t.Helper()
	run := snapshottedDiagnosticRun()
	run.StartedAt = startedAt
	if _, err := service.StartRun(context.Background(), ownerID, run); err != nil {
		t.Fatal(err)
	}
	previousSubmittedAt := startedAt
	for index := range run.Items {
		submittedAt := previousSubmittedAt.Add(time.Minute)
		attempt := diagnosticAttempt(run, index, previousSubmittedAt, submittedAt)
		attempt.Outcome = AttemptOutcomeSkipped
		attempt.Answer = nil
		if _, err := service.RecordAttempt(context.Background(), ownerID, attempt); err != nil {
			t.Fatal(err)
		}
		previousSubmittedAt = submittedAt
	}
	submitted, err := service.SubmitRun(context.Background(), ownerID, SubmitRunInput{
		ID:          run.ID,
		SubmittedAt: previousSubmittedAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	return submitted
}
