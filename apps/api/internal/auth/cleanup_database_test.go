package auth

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"
	"time"
)

func TestExpiredCleanupQueriesBoundOldestRowsAndDrainBothTables(t *testing.T) {
	base := expiredCleanupFixtureTime()
	live := time.Now().Add(time.Hour)
	fixture := seedCleanupRows(
		t,
		[]time.Time{base, base.Add(time.Hour), base.Add(2 * time.Hour), live},
		[]time.Time{base, base.Add(time.Hour), base.Add(2 * time.Hour), live},
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
	for _, hash := range fixture.sessionHashes[:2] {
		assertSessionHashExists(t, hash, false)
	}
	for _, hash := range fixture.authCodeHashes[:2] {
		assertAuthCodeHashExists(t, hash, false)
	}
	assertSessionHashExists(t, fixture.sessionHashes[2], true)
	assertAuthCodeHashExists(t, fixture.authCodeHashes[2], true)
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{
		expiredSessions:  1,
		liveSessions:     1,
		expiredAuthCodes: 1,
		liveAuthCodes:    1,
	})

	if err := drainExpiredRows(
		t.Context(),
		2,
		queries.DeleteExpiredSessionsBatch,
		queries.DeleteExpiredAuthCodesBatch,
	); err != nil {
		t.Fatal(err)
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{liveSessions: 1, liveAuthCodes: 1})
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

	cleanupCtx, cancel := context.WithTimeout(t.Context(), 2*time.Second)
	defer cancel()
	deleted, err := New(testPool).DeleteExpiredSessionsBatch(cleanupCtx, 1)
	if err != nil {
		t.Fatalf("cleanup waited on a concurrently extended session: %v", err)
	}
	if deleted != 0 {
		t.Fatalf("cleanup deleted %d locked sessions, want 0", deleted)
	}
	if err := tx.Commit(t.Context()); err != nil {
		t.Fatal(err)
	}

	if _, err := New(testPool).DeleteExpiredSessionsBatch(t.Context(), 1); err != nil {
		t.Fatal(err)
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{liveSessions: 1})
}

func TestConcurrentExpiredCleanupPartitionsSharedBacklog(t *testing.T) {
	const rowCount = 24
	fixture := seedCleanupRows(
		t,
		repeatedExpiry(expiredCleanupFixtureTime(), rowCount),
		repeatedExpiry(expiredCleanupFixtureTime(), rowCount),
	)
	queries := New(testPool)
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	start := make(chan struct{})
	results := make(chan error, 2)
	var deletedSessions atomic.Int64
	var deletedAuthCodes atomic.Int64

	for range 2 {
		go func() {
			<-start
			results <- drainExpiredRows(
				ctx,
				2,
				countCleanupBatch(queries.DeleteExpiredSessionsBatch, &deletedSessions),
				countCleanupBatch(queries.DeleteExpiredAuthCodesBatch, &deletedAuthCodes),
			)
		}()
	}
	close(start)
	for range 2 {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	if got := deletedSessions.Load(); got != rowCount {
		t.Fatalf("session delete ownership = %d, want %d", got, rowCount)
	}
	if got := deletedAuthCodes.Load(); got != rowCount {
		t.Fatalf("auth-code delete ownership = %d, want %d", got, rowCount)
	}
	assertCleanupCounts(t, fixture.user.ID, cleanupCounts{})
}

func countCleanupBatch(batch expiredCleanupBatch, total *atomic.Int64) expiredCleanupBatch {
	return func(ctx context.Context, batchSize int32) (int64, error) {
		deleted, err := batch(ctx, batchSize)
		if err != nil {
			return deleted, err
		}
		if deleted > int64(batchSize) {
			return deleted, fmt.Errorf("deleted %d rows with batch size %d", deleted, batchSize)
		}
		total.Add(deleted)
		return deleted, nil
	}
}
