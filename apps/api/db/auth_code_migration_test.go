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

func TestAuthCodeBindingMigrationRoundTrip(t *testing.T) {
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
	if err := goose.UpTo(database, "migrations", 5); err != nil {
		t.Fatal(err)
	}

	userID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into users (id, google_sub, email, name)
		values ($1, 'auth-code-migration', 'migration@example.com', 'Migration')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into auth_codes (code_hash, user_id, redirect, expires_at)
		values (decode(repeat('aa', 32), 'hex'), $1, '/prep', now() + interval '30 seconds')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}
	if err := goose.UpTo(database, "migrations", 6); err != nil {
		t.Fatal(err)
	}
	assertAuthCodeCount(t, ctx, pool, 1)
	if _, err := pool.Exec(ctx, `
		insert into auth_codes (code_hash, user_id, redirect, expires_at)
		values (decode(repeat('dd', 32), 'hex'), $1, '/legacy', now() + interval '30 seconds')`,
		userID,
	); err != nil {
		t.Fatalf("legacy insert after migration failed: %v", err)
	}
	if _, err := pool.Exec(ctx, `
		insert into auth_codes (code_hash, user_id, origin, redirect, expires_at)
		values (
			decode(repeat('ee', 32), 'hex'), $1, 'https://partial.example',
			'/partial', now() + interval '30 seconds'
		)`,
		userID,
	); err == nil {
		t.Fatal("migration accepted a partial browser binding")
	}

	if _, err := pool.Exec(ctx, `
		insert into auth_codes (
			code_hash, user_id, origin, redirect, browser_binding_id,
			browser_binding_hash, expires_at
		) values (
			decode(repeat('bb', 32), 'hex'), $1, 'https://preview.example', '/prep',
			'AAAAAAAAAAAAAAAAAAAAAA', decode(repeat('cc', 32), 'hex'),
			now() + interval '30 seconds'
		)`,
		userID,
	); err != nil {
		t.Fatal(err)
	}
	if err := goose.DownTo(database, "migrations", 5); err != nil {
		t.Fatal(err)
	}
	assertAuthCodeCount(t, ctx, pool, 3)
	if err := goose.UpTo(database, "migrations", 6); err != nil {
		t.Fatal(err)
	}
	assertAuthCodeCount(t, ctx, pool, 3)
}

func assertAuthCodeCount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, want int) {
	t.Helper()
	var count int
	if err := pool.QueryRow(ctx, "select count(*) from auth_codes").Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("auth code count = %d, want %d", count, want)
	}
}
