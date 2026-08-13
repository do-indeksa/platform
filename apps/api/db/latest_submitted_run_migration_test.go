package db

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestLatestSubmittedRunIndexMigrationRoundTrip(t *testing.T) {
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
	if err := goose.UpTo(database, "migrations", 7); err != nil {
		t.Fatal(err)
	}

	assertLatestSubmittedRunIndex(t, ctx, pool, false)
	if err := goose.UpTo(database, "migrations", 8); err != nil {
		t.Fatal(err)
	}
	assertLatestSubmittedRunIndex(t, ctx, pool, true)
	if err := goose.DownTo(database, "migrations", 7); err != nil {
		t.Fatal(err)
	}
	assertLatestSubmittedRunIndex(t, ctx, pool, false)
	if err := goose.UpTo(database, "migrations", 8); err != nil {
		t.Fatal(err)
	}
	assertLatestSubmittedRunIndex(t, ctx, pool, true)
}

func assertLatestSubmittedRunIndex(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	want bool,
) {
	t.Helper()
	var exists bool
	if err := pool.QueryRow(ctx, `
		select to_regclass('public.runs_user_kind_submitted_at_idx') is not null
	`).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != want {
		t.Fatalf("latest submitted run index presence = %v, want %v", exists, want)
	}
}
