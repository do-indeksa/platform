# 0059 - Lease-lock startup migrations

**Status:** accepted - 2026-08-14

## Context

Every API process applies embedded goose migrations before starting its HTTP
server. The package-global `goose.Up` path did not coordinate separate
processes, so a multi-replica rollout could let several pods inspect and apply
the same pending version concurrently.

The planned runtime uses Neon connection pooling. Neon documents that its
PgBouncer transaction mode does not preserve session state and does not support
session-level advisory locks. A migration lock tied to one database session is
therefore not a valid coordination primitive for the pooled application URL.

## Decision

Startup creates an instance-scoped, context-aware `goose.Provider` and supplies
goose's PostgreSQL table locker. The `goose_migration_lock` row is protected by
a renewable 30-second lease with a five-second heartbeat. Lock acquisition
retries every second for at most 60 attempts, and unlock retries every second
for at most ten attempts. An earlier process or shutdown context cancellation
ends the wait.

The table locker uses ordinary database operations and does not require the
same server connection across transactions. The Provider disables goose's
package-global Go migration registry. Each replica re-reads the applied version
set only after it owns the lock, and the HTTP server starts only after migration
startup returns successfully.

The current SQL migration set does not use session-scoped statements prohibited
by Neon's transaction pooler. This supports pooled compatibility by design, but
the local integration test exercises PostgreSQL directly rather than Neon or
PgBouncer. A disposable Neon branch using the production connection mode remains
a release gate. Any future migration that needs session state requires a
separate direct migration connection and a new decision.

## Consequences

Concurrent replicas serialize startup without a separate migration workload. A
crashed holder stops heartbeating and another replica can acquire the lock after
the lease expires. The database role must be allowed to create and update both
goose metadata tables.

Integration tests start eight independent pools against a pristine Postgres
database, invoke migration concurrently, and require one applied record per
embedded version plus a released lock row. The same test holds the lease and
proves that another waiter returns on caller cancellation. Every migration
round-trip test now uses an instance-scoped Provider instead of package-global
goose state.

References:

- [goose table locker](https://pkg.go.dev/github.com/pressly/goose/v3/lock#NewPostgresTableLocker)
- [goose Provider](https://pressly.github.io/goose/documentation/provider/)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
