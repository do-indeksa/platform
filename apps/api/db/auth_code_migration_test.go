package db

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestAuthMigrationsRoundTrip(t *testing.T) {
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
	applyMigrationsThrough(t, ctx, provider, 5)

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
	applyMigrationsThrough(t, ctx, provider, 6)
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
	rollbackMigrationsTo(t, ctx, provider, 5)
	assertAuthCodeCount(t, ctx, pool, 3)
	applyMigrationsThrough(t, ctx, provider, 6)
	assertAuthCodeCount(t, ctx, pool, 3)
	assertAuthExpiryIndexMigrationRoundTrip(t, ctx, provider, pool, userID)
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

func assertAuthExpiryIndexMigrationRoundTrip(
	t *testing.T,
	ctx context.Context,
	provider *goose.Provider,
	pool *pgxpool.Pool,
	userID uuid.UUID,
) {
	t.Helper()
	applyMigrationsThrough(t, ctx, provider, 11)
	if _, err := pool.Exec(ctx, `
		insert into sessions (token_hash, user_id, expires_at)
		values (decode(repeat('ff', 32), 'hex'), $1, now() - interval '1 minute')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}

	applyMigrationsThrough(t, ctx, provider, 12)
	assertAuthExpiryIndexes(t, ctx, pool, true)
	rollbackMigrationsTo(t, ctx, provider, 11)
	assertAuthExpiryIndexes(t, ctx, pool, false)
	assertAuthCodeCount(t, ctx, pool, 3)
	var sessions int
	if err := pool.QueryRow(ctx, "select count(*) from sessions").Scan(&sessions); err != nil {
		t.Fatal(err)
	}
	if sessions != 1 {
		t.Fatalf("session count after index rollback = %d, want 1", sessions)
	}

	applyMigrationsThrough(t, ctx, provider, 12)
	assertAuthExpiryIndexes(t, ctx, pool, true)
}

func assertAuthExpiryIndexes(t *testing.T, ctx context.Context, pool *pgxpool.Pool, want bool) {
	t.Helper()
	for _, index := range []struct {
		name     string
		fragment string
	}{
		{name: "sessions_expires_at_idx", fragment: "ON public.sessions USING btree (expires_at)"},
		{name: "auth_codes_expires_at_idx", fragment: "ON public.auth_codes USING btree (expires_at)"},
	} {
		var definition string
		err := pool.QueryRow(ctx, `
			select indexdef
			from pg_indexes
			where schemaname = current_schema() and indexname = $1`,
			index.name,
		).Scan(&definition)
		if !want {
			if !errors.Is(err, pgx.ErrNoRows) {
				t.Errorf("index %s lookup error = %v, want no rows", index.name, err)
			}
			continue
		}
		if err != nil {
			t.Errorf("index %s lookup: %v", index.name, err)
			continue
		}
		if !strings.Contains(definition, index.fragment) {
			t.Errorf("index %s definition = %q, want fragment %q", index.name, definition, index.fragment)
		}
	}
}
