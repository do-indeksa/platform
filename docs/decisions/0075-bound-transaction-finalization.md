# 0075 - Bound transaction finalization

**Status:** accepted - 2026-08-17

## Context

Seven auth and progress request paths open PostgreSQL transactions and defer
rollback for every return before or after commit. They passed the request
context to that rollback. A client disconnect or the application request
deadline can cancel the context before deferred cleanup starts. In pgx v5.10.0,
a rollback error leaves the connection in an undefined state and forces pgx to
close it. Repeated canceled requests can therefore create avoidable connection
replacement while the pool is bounded.

Validation, idempotency, conflict, and read-projection paths can all return
after a transaction has opened. Query cancellation alone does not prove that
every such path returned its connection to idle state.

## Decision

A shared `internal/dbx.Rollback` helper finalizes request-path transactions. It
retains context values, detaches caller cancellation and deadlines with
`context.WithoutCancel`, and applies an independent two-second deadline before
calling `pgx.Tx.Rollback`.

All seven production transaction sites use the helper from their existing
deferred cleanup. Queries and commits continue to use the original request
context. Calling the helper after a successful commit continues to return
`pgx.ErrTxClosed`, which deferred cleanup intentionally ignores.

Unit tests prove that canceled callers produce a live, value-preserving,
bounded cleanup context, that blocked cleanup reaches its deadline, and that
rollback errors are returned unchanged. PostgreSQL integration tests prove
that a real transaction returns its connection to idle state after caller
cancellation and that committed transactions retain pgx closed-transaction
behavior.

## Consequences

Transaction cleanup may continue for at most two seconds after the request is
canceled. If rollback still fails, pgx retains responsibility for discarding an
unsafe connection. This change does not alter statement or query cancellation,
the 20-second application request deadline, commit semantics, pool cardinality,
GraphQL behavior, frontend behavior, content, runtime configuration, or
deployment.
