package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/pressly/goose/v3/lock"
)

//go:embed migrations/*.sql
var migrations embed.FS

const (
	migrationLockLeaseDuration     = 30 * time.Second
	migrationLockHeartbeatInterval = 5 * time.Second
	migrationLockRetryInterval     = time.Second
	migrationLockRetryLimit        = 60
	migrationUnlockRetryInterval   = time.Second
	migrationUnlockRetryLimit      = 10
)

func Migrate(ctx context.Context, pool *pgxpool.Pool) (retErr error) {
	database := stdlib.OpenDBFromPool(pool)
	defer func() { retErr = errors.Join(retErr, database.Close()) }()

	provider, err := newMigrationProvider(database)
	if err != nil {
		return err
	}
	_, err = provider.Up(ctx)
	return err
}

func newMigrationProvider(database *sql.DB) (*goose.Provider, error) {
	migrationFS, err := fs.Sub(migrations, "migrations")
	if err != nil {
		return nil, fmt.Errorf("open embedded migrations: %w", err)
	}
	locker, err := newMigrationLocker()
	if err != nil {
		return nil, fmt.Errorf("configure migration lock: %w", err)
	}
	provider, err := goose.NewProvider(
		goose.DialectPostgres,
		database,
		migrationFS,
		goose.WithLocker(locker),
		goose.WithDisableGlobalRegistry(true),
	)
	if err != nil {
		return nil, fmt.Errorf("configure migration provider: %w", err)
	}
	return provider, nil
}

func newMigrationLocker() (lock.Locker, error) {
	return lock.NewPostgresTableLocker(
		lock.WithTableName("goose_migration_lock"),
		lock.WithTableLeaseDuration(migrationLockLeaseDuration),
		lock.WithTableHeartbeatInterval(migrationLockHeartbeatInterval),
		lock.WithTableLockTimeout(migrationLockRetryInterval, migrationLockRetryLimit),
		lock.WithTableUnlockTimeout(migrationUnlockRetryInterval, migrationUnlockRetryLimit),
	)
}
