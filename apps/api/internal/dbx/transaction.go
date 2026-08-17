package dbx

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
)

const rollbackTimeout = 2 * time.Second

// Rollback gives transaction cleanup a short deadline independent of caller cancellation.
func Rollback(ctx context.Context, tx pgx.Tx) error {
	return rollbackWithTimeout(ctx, tx, rollbackTimeout)
}

func rollbackWithTimeout(ctx context.Context, tx pgx.Tx, timeout time.Duration) error {
	rollbackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), timeout)
	defer cancel()
	return tx.Rollback(rollbackCtx)
}
