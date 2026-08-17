package db

import (
	"context"
	"encoding/json"
	"errors"
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

const attemptJournalOrderIndex = "attempts_user_id_journal_order_idx"

func TestAttemptJournalOrderIndexMigrationRoundTrip(t *testing.T) {
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
	applyMigrationsThrough(t, ctx, provider, 11)

	userID := uuid.New()
	if _, err := pool.Exec(ctx, `
		insert into users (id, google_sub, email, name)
		values ($1, 'journal-index-migration', 'journal-index@example.test', 'Journal Index')`,
		userID,
	); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `
		insert into attempts (
			user_id, task_id, slot, correct, source, created_at, started_at,
			submitted_at, outcome, grading_kind, task_revision
		)
		select
			$1,
			'journal-' || ((entry % 10) + 1),
			((entry % 10) + 1)::integer,
			entry % 2 = 0,
			'practice',
			timestamptz '2026-01-01' + entry * interval '1 second',
			timestamptz '2026-01-01' + entry * interval '1 second',
			case
				when entry % 5 = 0 then null
				else timestamptz '2026-01-01' + entry * interval '1 second'
			end,
			case when entry % 2 = 0 then 'correct' else 'incorrect' end,
			'auto',
			'sha256:' || repeat('a', 64)
		from generate_series(1, 256) entry`,
		userID,
	); err != nil {
		t.Fatal(err)
	}

	baseline := attemptRowsSnapshot(t, ctx, pool, userID)
	assertAttemptJournalOrderIndex(t, ctx, pool, false)
	applyMigrationsThrough(t, ctx, provider, 12)
	assertAttemptJournalOrderIndex(t, ctx, pool, true)
	assertAttemptRowsUnchanged(t, ctx, pool, userID, baseline)
	assertAttemptJournalOrderPlan(t, ctx, pool, userID)

	rollbackMigrationsTo(t, ctx, provider, 11)
	assertAttemptJournalOrderIndex(t, ctx, pool, false)
	assertAttemptRowsUnchanged(t, ctx, pool, userID, baseline)

	applyMigrationsThrough(t, ctx, provider, 12)
	assertAttemptJournalOrderIndex(t, ctx, pool, true)
	assertAttemptRowsUnchanged(t, ctx, pool, userID, baseline)
	assertAttemptJournalOrderPlan(t, ctx, pool, userID)
}

func assertAttemptJournalOrderIndex(
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
		attemptJournalOrderIndex,
	).Scan(&definition)
	if !want {
		if !errors.Is(err, pgx.ErrNoRows) {
			t.Fatalf("attempt journal index lookup error = %v, want no rows", err)
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	wantDefinition := "CREATE INDEX attempts_user_id_journal_order_idx " +
		"ON public.attempts USING btree " +
		"(user_id, COALESCE(submitted_at, created_at) DESC, id DESC)"
	if definition != wantDefinition {
		t.Fatalf("attempt journal index definition = %q, want %q", definition, wantDefinition)
	}
}

func attemptRowsSnapshot(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	userID uuid.UUID,
) string {
	t.Helper()
	var snapshot string
	if err := pool.QueryRow(ctx, `
		select json_agg(row_to_json(attempts) order by id)::text
		from attempts
		where user_id = $1`,
		userID,
	).Scan(&snapshot); err != nil {
		t.Fatal(err)
	}
	return snapshot
}

func assertAttemptRowsUnchanged(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	userID uuid.UUID,
	want string,
) {
	t.Helper()
	if got := attemptRowsSnapshot(t, ctx, pool, userID); got != want {
		t.Fatal("attempt rows changed during migration round trip")
	}
}

type attemptJournalPlan struct {
	NodeType  string               `json:"Node Type"`
	IndexName string               `json:"Index Name"`
	Plans     []attemptJournalPlan `json:"Plans"`
}

func assertAttemptJournalOrderPlan(
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
		explain (format json, costs off)
		select id
		from attempts
		where user_id = $1
		order by coalesce(submitted_at, created_at) desc, id desc
		limit 100`,
		userID,
	).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var documents []struct {
		Plan attemptJournalPlan `json:"Plan"`
	}
	if err := json.Unmarshal(raw, &documents); err != nil {
		t.Fatal(err)
	}
	if len(documents) != 1 || documents[0].Plan.NodeType != "Limit" {
		t.Fatalf("attempt journal plan does not start with a limit: %s", raw)
	}
	plan := documents[0].Plan
	if !planUsesAttemptJournalIndex(plan) {
		t.Fatalf("attempt journal plan does not use %s: %s", attemptJournalOrderIndex, raw)
	}
	if planContainsSort(plan) {
		t.Fatalf("attempt journal plan sorts despite the ordered index: %s", raw)
	}
}

func planUsesAttemptJournalIndex(plan attemptJournalPlan) bool {
	if plan.IndexName == attemptJournalOrderIndex &&
		(plan.NodeType == "Index Scan" || plan.NodeType == "Index Only Scan") {
		return true
	}
	for _, child := range plan.Plans {
		if planUsesAttemptJournalIndex(child) {
			return true
		}
	}
	return false
}

func planContainsSort(plan attemptJournalPlan) bool {
	if strings.Contains(plan.NodeType, "Sort") {
		return true
	}
	for _, child := range plan.Plans {
		if planContainsSort(child) {
			return true
		}
	}
	return false
}
