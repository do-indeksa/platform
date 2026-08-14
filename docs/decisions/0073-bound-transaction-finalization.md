# 0073 - Bound transaction finalization

**Status:** accepted - 2026-08-14.

**Context.** Seven auth and progress request paths open PostgreSQL transactions
and defer rollback for every return before or after commit. They passed the
request context to that rollback. A client disconnect or the application request
deadline can cancel the context before the deferred cleanup starts. The pinned
pgx implementation then attempts rollback with an already-canceled context and
discards the connection when rollback fails. Repeated canceled requests can
therefore create avoidable connection replacement while the pool is bounded.

Validation, idempotency, and conflict paths can all return after a transaction
has opened. Query cancellation alone does not guarantee that every such path has
returned the connection to its idle state.

**Decision.** A shared `internal/dbx.Rollback` helper finalizes request-path
transactions. It retains context values, removes the caller cancellation and
deadline with `context.WithoutCancel`, and applies an independent two-second
deadline before calling `pgx.Tx.Rollback`.

All seven production transaction sites use the helper from their existing
deferred cleanup. Queries and commits continue to use the original request
context. Calling the helper after a successful commit continues to return
`pgx.ErrTxClosed`, which the existing deferred cleanup intentionally ignores.

Unit tests prove that canceled callers produce a live, value-preserving, bounded
cleanup context and that rollback errors are returned unchanged. PostgreSQL
integration tests prove that a real transaction returns its connection to idle
state after caller cancellation and that committed transactions retain pgx's
closed-transaction behavior.

**Consequences.** Transaction cleanup may continue for at most two seconds after
the request is canceled. If rollback still fails, pgx retains responsibility for
discarding an unsafe connection. This change does not alter statement or query
cancellation, the 20-second application request deadline, commit semantics,
pool cardinality, GraphQL behavior, frontend behavior, content, or deployment.
