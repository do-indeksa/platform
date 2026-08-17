package db

import (
	"context"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func newTestMigrationProvider(t *testing.T, pool *pgxpool.Pool) *goose.Provider {
	t.Helper()

	database := stdlib.OpenDBFromPool(pool)
	t.Cleanup(func() {
		if err := database.Close(); err != nil {
			t.Errorf("close migration database: %v", err)
		}
	})
	provider, err := newMigrationProvider(database)
	if err != nil {
		t.Fatal(err)
	}
	return provider
}

func applyMigrationsThrough(
	t *testing.T,
	ctx context.Context,
	provider *goose.Provider,
	version int64,
) {
	t.Helper()
	if _, err := provider.UpTo(ctx, version); err != nil {
		t.Fatal(err)
	}
}

func rollbackMigrationsTo(
	t *testing.T,
	ctx context.Context,
	provider *goose.Provider,
	version int64,
) {
	t.Helper()
	if _, err := provider.DownTo(ctx, version); err != nil {
		t.Fatal(err)
	}
}
