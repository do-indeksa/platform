package progress

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestPrepPreferencesServiceUsesOwnerScopedCompareAndSwap(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	ownerID := seedProgressUser(t, "-prep-owner")
	otherID := seedProgressUser(t, "-prep-other")

	if _, err := service.GetPrepPreferences(ctx, ownerID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("empty owner preferences: got %v", err)
	}
	created, err := service.SavePrepPreferences(ctx, ownerID, SavePrepPreferencesInput{
		ExpectedVersion: 0,
		GoalPoints:      42,
		ExamDate:        "2027-06-28",
	})
	if err != nil {
		t.Fatal(err)
	}
	if created.UserID != ownerID || created.GoalPoints != 42 ||
		created.ExamDate.Format(time.DateOnly) != "2027-06-28" ||
		created.Version != 1 || created.UpdatedAt.IsZero() {
		t.Fatalf("unexpected created preferences: %+v", created)
	}
	if _, err := service.GetPrepPreferences(ctx, otherID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other owner saw preferences: %v", err)
	}
	if _, err := service.SavePrepPreferences(ctx, ownerID, SavePrepPreferencesInput{
		ExpectedVersion: 0,
		GoalPoints:      50,
		ExamDate:        "2028-07-01",
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("duplicate create: got %v", err)
	}

	updated, err := service.SavePrepPreferences(ctx, ownerID, SavePrepPreferencesInput{
		ExpectedVersion: 1,
		GoalPoints:      50,
		ExamDate:        "2028-07-01",
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated.GoalPoints != 50 ||
		updated.ExamDate.Format(time.DateOnly) != "2028-07-01" ||
		updated.Version != 2 || updated.UpdatedAt.Before(created.UpdatedAt) {
		t.Fatalf("unexpected updated preferences: %+v", updated)
	}
	if _, err := service.SavePrepPreferences(ctx, ownerID, SavePrepPreferencesInput{
		ExpectedVersion: 1,
		GoalPoints:      35,
		ExamDate:        "2029-08-02",
	}); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale update: got %v", err)
	}
	loaded, err := service.GetPrepPreferences(ctx, ownerID)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.GoalPoints != updated.GoalPoints ||
		!loaded.ExamDate.Equal(updated.ExamDate) || loaded.Version != updated.Version {
		t.Fatalf("stale update changed stored preferences: %+v", loaded)
	}
}

func TestPrepPreferencesServiceRejectsInvalidInputBeforeWriting(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool)
	ownerID := seedProgressUser(t, "-prep-invalid")

	for _, input := range []SavePrepPreferencesInput{
		{ExpectedVersion: -1, GoalPoints: 42, ExamDate: "2027-06-28"},
		{ExpectedVersion: 0, GoalPoints: 0, ExamDate: "2027-06-28"},
		{ExpectedVersion: 0, GoalPoints: 61, ExamDate: "2027-06-28"},
		{ExpectedVersion: 0, GoalPoints: 42, ExamDate: "2027-2-03"},
		{ExpectedVersion: 0, GoalPoints: 42, ExamDate: "2027-02-30"},
		{ExpectedVersion: 0, GoalPoints: 42, ExamDate: "1999-12-31"},
		{ExpectedVersion: 0, GoalPoints: 42, ExamDate: "10000-01-01"},
	} {
		if _, err := service.SavePrepPreferences(ctx, ownerID, input); !errors.Is(err, ErrInvalidInput) {
			t.Fatalf("input %+v: got %v", input, err)
		}
	}
	if _, err := service.GetPrepPreferences(ctx, ownerID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("invalid input created preferences: %v", err)
	}
}
