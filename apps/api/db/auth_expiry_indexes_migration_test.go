package db

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestAuthExpiryIndexesMigrationRoundTrip(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

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
	applyMigrationsThrough(t, ctx, provider, 10)

	userID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into users (id, google_sub, email, name)
		values ($1, 'expiry-index-migration', 'migration@example.com', 'Migration')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into sessions (token_hash, user_id, expires_at)
		values (decode(repeat('aa', 32), 'hex'), $1, now() - interval '1 minute')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into auth_codes (code_hash, user_id, redirect, expires_at)
		values (decode(repeat('bb', 32), 'hex'), $1, '/prep', now() - interval '1 minute')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}

	baselineIndexes := authIndexNames(t, ctx, pool)
	applyMigrationsThrough(t, ctx, provider, 11)
	assertAuthExpiryIndexes(t, ctx, pool, true)

	rollbackMigrationsTo(t, ctx, provider, 10)
	assertAuthExpiryIndexes(t, ctx, pool, false)
	if got := authIndexNames(t, ctx, pool); !slices.Equal(got, baselineIndexes) {
		t.Fatalf("auth indexes after rollback = %v, want %v", got, baselineIndexes)
	}
	assertTableRowCount(t, ctx, pool, "sessions", 1)
	assertTableRowCount(t, ctx, pool, "auth_codes", 1)

	applyMigrationsThrough(t, ctx, provider, 11)
	assertAuthExpiryIndexes(t, ctx, pool, true)
}

func authIndexNames(t *testing.T, ctx context.Context, pool *pgxpool.Pool) []string {
	t.Helper()
	rows, err := pool.Query(ctx, `
		select tablename || ':' || indexname
		from pg_indexes
		where schemaname = current_schema()
		  and tablename in ('sessions', 'auth_codes')
		order by tablename, indexname`)
	if err != nil {
		t.Fatal(err)
	}
	names, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	return names
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

func assertTableRowCount(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	table string,
	want int,
) {
	t.Helper()
	query := map[string]string{
		"sessions":   "select count(*) from sessions",
		"auth_codes": "select count(*) from auth_codes",
	}[table]
	if query == "" {
		t.Fatalf("unsupported auth table %q", table)
	}
	var count int
	if err := pool.QueryRow(ctx, query).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("%s row count = %d, want %d", table, count, want)
	}
}
