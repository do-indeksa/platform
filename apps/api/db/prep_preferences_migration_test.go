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

func TestPrepPreferencesMigrationRoundTrip(t *testing.T) {
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
	if err := goose.UpTo(database, "migrations", 8); err != nil {
		t.Fatal(err)
	}
	assertPrepPreferencesTable(t, ctx, pool, false)
	if err := goose.UpTo(database, "migrations", 9); err != nil {
		t.Fatal(err)
	}
	assertPrepPreferencesTable(t, ctx, pool, true)

	userID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into users (id, google_sub, email, name)
		values ($1, 'prep-migration', 'prep-migration@example.test', 'Prep Migration')`,
		userID); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into prep_preferences (user_id, goal_points, exam_date)
		values ($1, 42, date '2028-02-29')`, userID); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`update prep_preferences set goal_points = 0 where user_id = $1`,
		`update prep_preferences set goal_points = 61 where user_id = $1`,
		`update prep_preferences set version = 0 where user_id = $1`,
		`update prep_preferences set exam_date = date '10000-01-01' where user_id = $1`,
	} {
		if _, err := pool.Exec(ctx, statement, userID); err == nil {
			t.Fatalf("database accepted invalid preference statement: %s", statement)
		}
	}
	if _, err := pool.Exec(ctx, "delete from users where id = $1", userID); err != nil {
		t.Fatal(err)
	}
	var count int
	if err := pool.QueryRow(ctx,
		"select count(*) from prep_preferences where user_id = $1", userID).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 0 {
		t.Fatalf("preferences survived owner deletion: %d", count)
	}

	if err := goose.DownTo(database, "migrations", 8); err != nil {
		t.Fatal(err)
	}
	assertPrepPreferencesTable(t, ctx, pool, false)
	if err := goose.UpTo(database, "migrations", 9); err != nil {
		t.Fatal(err)
	}
	assertPrepPreferencesTable(t, ctx, pool, true)
}

func assertPrepPreferencesTable(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	want bool,
) {
	t.Helper()
	var exists bool
	if err := pool.QueryRow(ctx,
		"select to_regclass('public.prep_preferences') is not null").Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != want {
		t.Fatalf("prep_preferences table presence = %v, want %v", exists, want)
	}
}
