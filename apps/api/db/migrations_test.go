package db

import (
	"context"
	"database/sql"
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
	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpTo(database, "migrations", 3); err != nil {
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

	assertLearningRunBackfill(t, ctx, database, pool, createdAt)
	if err := goose.DownTo(database, "migrations", 3); err != nil {
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

	assertLearningRunBackfill(t, ctx, database, pool, createdAt)
}

func assertLearningRunBackfill(
	t *testing.T,
	ctx context.Context,
	database *sql.DB,
	pool *pgxpool.Pool,
	createdAt time.Time,
) {
	t.Helper()
	if err := goose.UpTo(database, "migrations", 4); err != nil {
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
