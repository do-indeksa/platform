package db

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
)

const authCodeOwnerIndex = "auth_codes_user_id_idx"

func assertAuthCodeOwnerIndexMigrationRoundTrip(
	t *testing.T,
	ctx context.Context,
	provider *goose.Provider,
	pool *pgxpool.Pool,
	userID uuid.UUID,
) {
	t.Helper()
	applyMigrationsThrough(t, ctx, provider, 13)
	assertAuthCodeOwnerIndex(t, ctx, pool, false)
	applyMigrationsThrough(t, ctx, provider, 14)
	assertAuthCodeOwnerIndex(t, ctx, pool, true)
	assertAuthCodeOwnerPlan(t, ctx, pool, userID)

	rollbackMigrationsTo(t, ctx, provider, 13)
	assertAuthCodeOwnerIndex(t, ctx, pool, false)
	assertAuthCodeCount(t, ctx, pool, 3)
	applyMigrationsThrough(t, ctx, provider, 14)
	assertAuthCodeOwnerIndex(t, ctx, pool, true)
	assertAuthCodeOwnerPlan(t, ctx, pool, userID)
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

type authCodeExplainPlan struct {
	IndexName string                `json:"Index Name"`
	Plans     []authCodeExplainPlan `json:"Plans"`
}

func assertAuthCodeOwnerPlan(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	userID uuid.UUID,
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
		explain (format json)
		delete from auth_codes
		where user_id = $1`,
		userID,
	).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var documents []struct {
		Plan authCodeExplainPlan `json:"Plan"`
	}
	if err := json.Unmarshal(raw, &documents); err != nil {
		t.Fatal(err)
	}
	if len(documents) != 1 || !authCodePlanUsesIndex(documents[0].Plan, authCodeOwnerIndex) {
		t.Fatalf("auth code owner plan does not use %s: %s", authCodeOwnerIndex, raw)
	}
}

func authCodePlanUsesIndex(plan authCodeExplainPlan, name string) bool {
	if plan.IndexName == name {
		return true
	}
	for _, child := range plan.Plans {
		if authCodePlanUsesIndex(child, name) {
			return true
		}
	}
	return false
}
