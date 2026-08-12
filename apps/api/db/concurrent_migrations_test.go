package db

import (
	"context"
	"errors"
	"io/fs"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
)

func TestMigrateSerializesConcurrentReplicas(t *testing.T) {
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

	const replicaCount = 8
	pools := make([]*pgxpool.Pool, replicaCount)
	for index := range pools {
		pool, err := pgxpool.New(ctx, dsn)
		if err != nil {
			t.Fatal(err)
		}
		pools[index] = pool
		t.Cleanup(pool.Close)
	}

	start := make(chan struct{})
	results := make(chan error, replicaCount)
	for _, pool := range pools {
		go func() {
			<-start
			results <- Migrate(ctx, pool)
		}()
	}
	close(start)
	for range replicaCount {
		if err := <-results; err != nil {
			t.Errorf("concurrent migration failed: %v", err)
		}
	}
	if t.Failed() {
		return
	}

	wantVersions := migrationFileCount(t)
	var applied, distinct int
	if err := pools[0].QueryRow(ctx, `
		select count(*), count(distinct version_id)
		from goose_db_version
		where is_applied and version_id > 0`).Scan(&applied, &distinct); err != nil {
		t.Fatal(err)
	}
	if applied != wantVersions || distinct != wantVersions {
		t.Fatalf("applied versions = %d (%d distinct); want %d", applied, distinct, wantVersions)
	}
	var lockRows, heldLocks int
	if err := pools[0].QueryRow(ctx, `
		select count(*), count(*) filter (
			where locked or locked_by is not null or lease_expires_at is not null
		)
		from goose_migration_lock`).Scan(&lockRows, &heldLocks); err != nil {
		t.Fatal(err)
	}
	if lockRows != 1 || heldLocks != 0 {
		t.Fatalf("migration lock rows = %d (%d held); want 1 released", lockRows, heldLocks)
	}

	assertMigrationLockCancellation(t, pools[0])
}

func assertMigrationLockCancellation(t *testing.T, pool *pgxpool.Pool) {
	t.Helper()
	heldDatabase := stdlib.OpenDBFromPool(pool)
	t.Cleanup(func() { _ = heldDatabase.Close() })
	waitingDatabase := stdlib.OpenDBFromPool(pool)
	t.Cleanup(func() { _ = waitingDatabase.Close() })
	held, err := newMigrationLocker()
	if err != nil {
		t.Fatal(err)
	}
	waiting, err := newMigrationLocker()
	if err != nil {
		t.Fatal(err)
	}
	if err := held.Lock(context.Background(), heldDatabase); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := held.Unlock(context.Background(), heldDatabase); err != nil {
			t.Errorf("release held migration lock: %v", err)
		}
	})

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	started := time.Now()
	err = waiting.Lock(ctx, waitingDatabase)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("waiting lock error = %v; want context deadline", err)
	}
	if elapsed := time.Since(started); elapsed < 100*time.Millisecond || elapsed > time.Second {
		t.Fatalf("waiting lock respected deadline after %v", elapsed)
	}
}

func migrationFileCount(t *testing.T) int {
	t.Helper()
	entries, err := fs.ReadDir(migrations, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			count++
		}
	}
	if count == 0 {
		t.Fatal("embedded migration set is empty")
	}
	return count
}
