package graph

import (
	"testing"

	"github.com/do-indeksa/platform/apps/api/internal/graph/model"
)

func TestRecentAttemptsReturnsNewestWindow(t *testing.T) {
	item := &model.RunItem{RecentAttempts: []model.Attempt{
		{ID: "oldest"},
		{ID: "middle"},
		{ID: "newest"},
	}}

	attempts, err := (&runItemResolver{}).RecentAttempts(t.Context(), item, 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 2 || attempts[0].ID != "middle" || attempts[1].ID != "newest" {
		t.Fatalf("unexpected recent attempts: %+v", attempts)
	}
}
