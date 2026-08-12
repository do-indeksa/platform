package db

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestLearningRunMigrationRoundTrip(t *testing.T) {
	ctx := context.Background()
	container, err := postgres.Run(ctx, "postgres:17-alpine",
		postgres.WithDatabase("test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(time.Minute)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = testcontainers.TerminateContainer(container) })

	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		t.Fatal(err)
	}
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	database := stdlib.OpenDBFromPool(pool)
	t.Cleanup(func() { _ = database.Close() })
	provider, err := newMigrationProvider(database)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 3); err != nil {
		t.Fatal(err)
	}

	userID := uuid.New()
	createdAt := time.Now().Add(-time.Hour).UTC().Truncate(time.Second)
	if _, err := pool.Exec(ctx,
		"insert into users (id, google_sub, email, name) values ($1, $2, $3, $4)",
		userID, "migration-user", "migration@example.com", "Migration"); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx,
		"insert into attempts (user_id, task_id, slot, correct, source, help_level, created_at) values ($1, $2, $3, $4, $5, $6, $7)",
		userID, "log-001", 3, true, "practice", 1, createdAt); err != nil {
		t.Fatal(err)
	}

	assertLearningRunBackfill(t, ctx, provider, pool, createdAt)
	if _, err := provider.DownTo(ctx, 3); err != nil {
		t.Fatal(err)
	}

	var taskID string
	var correct bool
	if err := pool.QueryRow(ctx, "select task_id, correct from attempts where user_id = $1", userID).
		Scan(&taskID, &correct); err != nil {
		t.Fatal(err)
	}
	if taskID != "log-001" || !correct {
		t.Fatalf("legacy attempt changed after rollback: %q %v", taskID, correct)
	}

	assertLearningRunBackfill(t, ctx, provider, pool, createdAt)
	assertRunCheckpointMigrationRoundTrip(t, ctx, provider, pool, userID, createdAt)
}

func assertLearningRunBackfill(
	t *testing.T,
	ctx context.Context,
	provider *goose.Provider,
	pool *pgxpool.Pool,
	createdAt time.Time,
) {
	t.Helper()
	if _, err := provider.UpTo(ctx, 4); err != nil {
		t.Fatal(err)
	}

	var publicID uuid.UUID
	var outcome, gradingKind string
	var startedAt, submittedAt time.Time
	if err := pool.QueryRow(ctx,
		"select public_id, outcome, grading_kind, started_at, submitted_at from attempts where task_id = 'log-001'").
		Scan(&publicID, &outcome, &gradingKind, &startedAt, &submittedAt); err != nil {
		t.Fatal(err)
	}
	if publicID == uuid.Nil || outcome != "correct" || gradingKind != "auto" ||
		!startedAt.Equal(createdAt) || !submittedAt.Equal(createdAt) {
		t.Fatalf("unexpected backfill: %s %q %q %v %v", publicID, outcome, gradingKind, startedAt, submittedAt)
	}
}

func assertRunCheckpointMigrationRoundTrip(
	t *testing.T,
	ctx context.Context,
	provider *goose.Provider,
	pool *pgxpool.Pool,
	userID uuid.UUID,
	startedAt time.Time,
) {
	t.Helper()
	runID := uuid.New()
	itemID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into runs (id, user_id, kind, blueprint_version, content_revision, started_at)
		values ($1, $2, 'diagnostic', 'diagnostic-v1', 'content-revision', $3)`,
		runID, userID, startedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into run_items (id, run_id, user_id, task_id, ordinal, exam_position, topic, task_revision)
		values ($1, $2, $3, 'log-001', 1, 3, 'logaritmi', 'task-revision')`,
		itemID, runID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := provider.UpTo(ctx, 5); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into run_checkpoints (run_id, user_id, version, current_ordinal)
		values ($1, $2, 1, 1)`, runID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into run_checkpoint_drafts (run_id, run_item_id, user_id, answer)
		values ($1, $2, $3, '["42"]')`, runID, itemID, userID); err != nil {
		t.Fatal(err)
	}
	otherRunID := uuid.New()
	otherItemID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into runs (id, user_id, kind, blueprint_version, content_revision, started_at)
		values ($1, $2, 'diagnostic', 'diagnostic-v1', 'content-revision', $3)`,
		otherRunID, userID, startedAt); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into run_items (id, run_id, user_id, task_id, ordinal, exam_position, topic, task_revision)
		values ($1, $2, $3, 'eks-001', 1, 4, 'eksponencijalne', 'task-revision')`,
		otherItemID, otherRunID, userID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into run_checkpoint_drafts (run_id, run_item_id, user_id, answer)
		values ($1, $2, $3, '["wrong run"]')`, runID, otherItemID, userID); err == nil {
		t.Fatal("checkpoint accepted a draft from another run")
	}

	if _, err := provider.DownTo(ctx, 4); err != nil {
		t.Fatal(err)
	}
	var storedItem uuid.UUID
	if err := pool.QueryRow(ctx, "select id from run_items where run_id = $1", runID).Scan(&storedItem); err != nil {
		t.Fatal(err)
	}
	if storedItem != itemID {
		t.Fatalf("rollback changed run item: %s", storedItem)
	}
	if _, err := provider.UpTo(ctx, 5); err != nil {
		t.Fatal(err)
	}
	var checkpoints int
	if err := pool.QueryRow(ctx, "select count(*) from run_checkpoints where run_id = $1", runID).
		Scan(&checkpoints); err != nil {
		t.Fatal(err)
	}
	if checkpoints != 0 {
		t.Fatalf("checkpoint survived migration rollback: %d", checkpoints)
	}
}
