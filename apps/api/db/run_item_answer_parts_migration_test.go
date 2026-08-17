package db

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestRunItemAnswerPartsMigrationRoundTrip(t *testing.T) {
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
	provider := newTestMigrationProvider(t, pool)
	applyMigrationsThrough(t, ctx, provider, 6)

	userID := uuid.New()
	runID := uuid.New()
	itemID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into users (id, google_sub, email, name)
		values ($1, 'answer-parts-migration', 'answer-parts@example.com', 'Migration')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into runs (id, user_id, kind, blueprint_version, content_revision, started_at)
		values ($1, $2, 'diagnostic', 'diagnostic-v1', 'content-revision', now())`,
		runID, userID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into run_items (
			id, run_id, user_id, task_id, ordinal, exam_position, topic, task_revision
		) values ($1, $2, $3, 'log-001', 1, 3, 'logaritmi', 'task-revision')`,
		itemID, runID, userID,
	); err != nil {
		t.Fatal(err)
	}

	applyMigrationsThrough(t, ctx, provider, 7)
	var legacy sql.NullInt16
	if err := pool.QueryRow(ctx,
		"select answer_part_count from run_items where id = $1", itemID,
	).Scan(&legacy); err != nil {
		t.Fatal(err)
	}
	if legacy.Valid {
		t.Fatalf("legacy item received an invented answer count: %d", legacy.Int16)
	}
	for _, count := range []int16{1, 6} {
		if _, err := pool.Exec(ctx,
			"update run_items set answer_part_count = $2 where id = $1", itemID, count,
		); err != nil {
			t.Fatalf("valid count %d: %v", count, err)
		}
	}
	for _, count := range []int16{0, 7} {
		if _, err := pool.Exec(ctx,
			"update run_items set answer_part_count = $2 where id = $1", itemID, count,
		); err == nil {
			t.Fatalf("invalid count %d was accepted", count)
		}
	}

	rollbackMigrationsTo(t, ctx, provider, 6)
	assertAnswerPartCountColumn(t, ctx, pool, false)
	applyMigrationsThrough(t, ctx, provider, 7)
	assertAnswerPartCountColumn(t, ctx, pool, true)
	if err := pool.QueryRow(ctx,
		"select answer_part_count from run_items where id = $1", itemID,
	).Scan(&legacy); err != nil {
		t.Fatal(err)
	}
	if legacy.Valid {
		t.Fatalf("round trip invented an answer count: %d", legacy.Int16)
	}
}

func assertAnswerPartCountColumn(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	want bool,
) {
	t.Helper()
	var count int
	if err := pool.QueryRow(ctx, `
		select count(*)
		from information_schema.columns
		where table_schema = 'public'
		  and table_name = 'run_items'
		  and column_name = 'answer_part_count'
	`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if (count == 1) != want {
		t.Fatalf("answer_part_count presence = %d, want %v", count, want)
	}
}
