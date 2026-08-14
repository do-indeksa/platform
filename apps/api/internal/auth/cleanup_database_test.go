package auth

import (
	"context"
	"testing"
	"time"
)

func TestExpiredCleanupQueriesBoundAndDrainBothTables(t *testing.T) {
	now := time.Now()
	fixture := seedCleanupRows(
		t,
		append(repeatedExpiry(expiredCleanupFixtureTime(), 5), repeatedExpiry(now.Add(time.Hour), 2)...),
		append(repeatedExpiry(expiredCleanupFixtureTime(), 5), repeatedExpiry(now.Add(time.Hour), 2)...),
	)
	queries := New(testPool)

	deletedSessions, err := queries.DeleteExpiredSessionsBatch(t.Context(), 2)
	if err != nil {
		t.Fatal(err)
	}
	deletedAuthCodes, err := queries.DeleteExpiredAuthCodesBatch(t.Context(), 2)
	if err != nil {
		t.Fatal(err)
	}
	if deletedSessions != 2 || deletedAuthCodes != 2 {
		t.Fatalf("first batch deleted sessions=%d auth_codes=%d, want 2 each", deletedSessions, deletedAuthCodes)
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{
		expiredSessions:  3,
		liveSessions:     2,
		expiredAuthCodes: 3,
		liveAuthCodes:    2,
	})

	if err := drainExpiredRows(
		t.Context(),
		2,
		queries.DeleteExpiredSessionsBatch,
		queries.DeleteExpiredAuthCodesBatch,
	); err != nil {
		t.Fatal(err)
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{liveSessions: 2, liveAuthCodes: 2})
}

func TestServiceCleanupExpiredDrainsMoreThanProductionBatch(t *testing.T) {
	fixture := seedCleanupRows(t, nil, nil)
	rowCount := expiredCleanupBatchSize + 1
	expiresAt := expiredCleanupFixtureTime()
	key := fixture.user.ID.String()
	if _, err := testPool.Exec(t.Context(), `
		insert into sessions (token_hash, user_id, expires_at)
		select decode(md5($1 || '-session-' || ordinal::text), 'hex'), $2, $3
		from generate_series(1, $4::integer) as ordinal
	`, key, fixture.user.ID, expiresAt, rowCount); err != nil {
		t.Fatal(err)
	}
	if _, err := testPool.Exec(t.Context(), `
		insert into auth_codes (code_hash, user_id, redirect, expires_at)
		select decode(md5($1 || '-auth-code-' || ordinal::text), 'hex'), $2, '/', $3
		from generate_series(1, $4::integer) as ordinal
	`, key, fixture.user.ID, expiresAt, rowCount); err != nil {
		t.Fatal(err)
	}

	if err := NewService(testPool, Config{}).CleanupExpired(t.Context()); err != nil {
		t.Fatal(err)
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{})
}

func TestExpiredSessionCleanupSkipsConcurrentExtension(t *testing.T) {
	fixture := seedCleanupRows(t, []time.Time{expiredCleanupFixtureTime()}, nil)
	tx, err := testPool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err := tx.Exec(
		t.Context(),
		"update sessions set expires_at = $1 where token_hash = $2",
		time.Now().Add(time.Hour),
		fixture.sessionHashes[0],
	); err != nil {
		t.Fatal(err)
	}

	cleanupCtx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	_, err = New(testPool).DeleteExpiredSessionsBatch(cleanupCtx, 1)
	if err != nil {
		t.Fatalf("cleanup waited on a concurrently extended session: %v", err)
	}
	if err := tx.Commit(t.Context()); err != nil {
		t.Fatal(err)
	}

	if _, err := New(testPool).DeleteExpiredSessionsBatch(t.Context(), 1); err != nil {
		t.Fatal(err)
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{liveSessions: 1})
}

func TestConcurrentExpiredCleanupDrainsSharedBacklog(t *testing.T) {
	fixture := seedCleanupRows(
		t,
		repeatedExpiry(expiredCleanupFixtureTime(), 24),
		repeatedExpiry(expiredCleanupFixtureTime(), 24),
	)
	queries := New(testPool)
	ctx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	start := make(chan struct{})
	results := make(chan error, 2)
	for range 2 {
		go func() {
			<-start
			results <- drainExpiredRows(
				ctx,
				2,
				queries.DeleteExpiredSessionsBatch,
				queries.DeleteExpiredAuthCodesBatch,
			)
		}()
	}
	close(start)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{})
}
