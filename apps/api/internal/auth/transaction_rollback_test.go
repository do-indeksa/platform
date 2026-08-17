package auth

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"

	"github.com/do-indeksa/platform/apps/api/internal/dbx"
)

func TestCanceledCallerStillRollsBackReusableConnection(t *testing.T) {
	connection, err := testPool.Acquire(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Release()

	tx, err := connection.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	caller, cancel := context.WithCancel(t.Context())
	cancel()
	if err := dbx.Rollback(caller, tx); err != nil {
		t.Fatalf("rollback with canceled caller: %v", err)
	}
	if status := connection.Conn().PgConn().TxStatus(); status != 'I' {
		t.Fatalf("connection transaction status = %q, want idle", status)
	}

	var one int
	if err := connection.QueryRow(t.Context(), "select 1").Scan(&one); err != nil {
		t.Fatalf("reuse connection after rollback: %v", err)
	}
	if one != 1 {
		t.Fatalf("connection query result = %d, want 1", one)
	}
}

func TestCommittedTransactionRollbackRemainsClosed(t *testing.T) {
	connection, err := testPool.Acquire(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Release()

	tx, err := connection.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(t.Context()); err != nil {
		t.Fatal(err)
	}

	caller, cancel := context.WithCancel(t.Context())
	cancel()
	if err := dbx.Rollback(caller, tx); !errors.Is(err, pgx.ErrTxClosed) {
		t.Fatalf("rollback after commit = %v, want pgx.ErrTxClosed", err)
	}
	if status := connection.Conn().PgConn().TxStatus(); status != 'I' {
		t.Fatalf("connection transaction status = %q, want idle", status)
	}
}
