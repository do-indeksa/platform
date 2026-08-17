package db

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

const authCodeOwnerIndex = "auth_codes_user_id_idx"

func TestAuthCodeOwnerIndexMigrationRoundTrip(t *testing.T) {
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
	applyMigrationsThrough(t, ctx, provider, 12)

	ownerID := uuid.New()
	neighborID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into users (id, google_sub, email, name)
		values
			($1, 'auth-code-owner', 'owner@example.test', 'Owner'),
			($2, 'auth-code-neighbor', 'neighbor@example.test', 'Neighbor')`,
		ownerID,
		neighborID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into auth_codes (code_hash, user_id, redirect, expires_at)
		select
			decode(lpad(to_hex(entry), 64, '0'), 'hex'),
			case when entry = 1 then $1::uuid else $2::uuid end,
			'/prep',
			timestamptz '2026-01-01' + entry * interval '1 second'
		from generate_series(1, 256) entry`,
		ownerID,
		neighborID,
	); err != nil {
		t.Fatal(err)
	}

	baseline := authCodeRowsSnapshot(t, ctx, pool)
	assertAuthCodeOwnerIndex(t, ctx, pool, false)
	applyMigrationsThrough(t, ctx, provider, 13)
	assertAuthCodeOwnerIndex(t, ctx, pool, true)
	assertAuthCodeRowsUnchanged(t, ctx, pool, baseline)
	assertAuthCodeOwnerDeletePlan(t, ctx, pool, ownerID)

	rollbackMigrationsTo(t, ctx, provider, 12)
	assertAuthCodeOwnerIndex(t, ctx, pool, false)
	assertAuthCodeRowsUnchanged(t, ctx, pool, baseline)

	applyMigrationsThrough(t, ctx, provider, 13)
	assertAuthCodeOwnerIndex(t, ctx, pool, true)
	assertAuthCodeRowsUnchanged(t, ctx, pool, baseline)
	assertAuthCodeOwnerDeletePlan(t, ctx, pool, ownerID)
}

func assertAuthCodeOwnerIndex(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	want bool,
) {
	t.Helper()
	var definition string
	err := pool.QueryRow(ctx, `
		select indexdef
		from pg_indexes
		where schemaname = current_schema() and indexname = $1`,
		authCodeOwnerIndex,
	).Scan(&definition)
	if !want {
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("auth code owner index lookup error = %v, want no rows", err)
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	wantDefinition := "CREATE INDEX auth_codes_user_id_idx " +
		"ON public.auth_codes USING btree (user_id)"
	if definition != wantDefinition {
		t.Fatalf("auth code owner index definition = %q, want %q", definition, wantDefinition)
	}
}

func authCodeRowsSnapshot(t *testing.T, ctx context.Context, pool *pgxpool.Pool) string {
	t.Helper()
	var snapshot string
	if err := pool.QueryRow(ctx, `
		select json_agg(row_to_json(auth_codes) order by encode(code_hash, 'hex'))::text
		from auth_codes`,
	).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func assertAuthCodeRowsUnchanged(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	want string,
) {
	t.Helper()
	if got := authCodeRowsSnapshot(t, ctx, pool); got != want {
		t.Fatal("auth code rows changed during migration round trip")
	}
}

type authCodeDeletePlan struct {
	NodeType  string               `json:"Node Type"`
	Operation string               `json:"Operation"`
	IndexName string               `json:"Index Name"`
	Plans     []authCodeDeletePlan `json:"Plans"`
}

func assertAuthCodeOwnerDeletePlan(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	ownerID uuid.UUID,
) {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, "set local enable_seqscan = off"); err != nil {
		t.Fatal(err)
	}

	var raw []byte
	if err := tx.QueryRow(ctx, `
		explain (format json, costs off)
		delete from auth_codes
		where user_id = $1`,
		ownerID,
	).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var documents []struct {
		Plan authCodeDeletePlan `json:"Plan"`
	}
	if err := json.Unmarshal(raw, &documents); err != nil {
		t.Fatal(err)
	}
	if len(documents) != 1 || documents[0].Plan.NodeType != "ModifyTable" ||
		documents[0].Plan.Operation != "Delete" {
		t.Fatalf("auth code owner plan is not a delete: %s", raw)
	}
	if !authCodeDeletePlanUsesOwnerIndex(documents[0].Plan) {
		t.Fatalf("auth code owner plan does not use %s: %s", authCodeOwnerIndex, raw)
	}
}

func authCodeDeletePlanUsesOwnerIndex(plan authCodeDeletePlan) bool {
	if plan.IndexName == authCodeOwnerIndex {
		return true
	}
	for _, child := range plan.Plans {
		if authCodeDeletePlanUsesOwnerIndex(child) {
			return true
		}
	}
	return false
}
