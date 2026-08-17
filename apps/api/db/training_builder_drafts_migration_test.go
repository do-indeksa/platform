package db

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestTrainingBuilderDraftsMigrationRoundTrip(t *testing.T) {
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
	applyMigrationsThrough(t, ctx, provider, 9)
	assertTrainingBuilderDraftsTable(t, ctx, pool, false)
	applyMigrationsThrough(t, ctx, provider, 10)
	assertTrainingBuilderDraftsTable(t, ctx, pool, true)

	userID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into users (id, google_sub, email, name)
		values ($1, 'training-migration', 'training-migration@example.test', 'Training Migration')`,
		userID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into training_builder_drafts (
			user_id, blueprint_version, position_1_quantity, position_4_quantity,
			difficulty, only_new, shuffle, prioritize_mistakes
		) values ($1, '2026.1', 3, 2, 'balanced', true, true, false)`, userID); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`update training_builder_drafts set blueprint_version = 'ftn-p1:2026.1' where user_id = $1`,
		`update training_builder_drafts set position_1_quantity = -1 where user_id = $1`,
		`update training_builder_drafts set position_1_quantity = 11 where user_id = $1`,
		`update training_builder_drafts set position_1_quantity = 6, position_2_quantity = 5 where user_id = $1`,
		`update training_builder_drafts set difficulty = 'expert' where user_id = $1`,
		`update training_builder_drafts set version = 0 where user_id = $1`,
	} {
		if _, err := pool.Exec(ctx, statement, userID); err == nil {
			t.Fatalf("database accepted invalid draft statement: %s", statement)
		}
	}
	if _, err := pool.Exec(ctx, "delete from users where id = $1", userID); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(ctx,
		"select count(*) from training_builder_drafts where user_id = $1", userID).
		Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("draft survived owner deletion: %d", count)
	}

	rollbackMigrationsTo(t, ctx, provider, 9)
	assertTrainingBuilderDraftsTable(t, ctx, pool, false)
	applyMigrationsThrough(t, ctx, provider, 10)
	assertTrainingBuilderDraftsTable(t, ctx, pool, true)
}

func assertTrainingBuilderDraftsTable(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	want bool,
) {
	t.Helper()
	var exists bool
	if err := pool.QueryRow(ctx,
		"select to_regclass('public.training_builder_drafts') is not null").
		Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != want {
		t.Fatalf("training_builder_drafts table presence = %v, want %v", exists, want)
	}
}
