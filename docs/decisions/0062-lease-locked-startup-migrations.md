# 0062 - Lease-lock startup migrations

**Status:** accepted - 2026-08-17

## Context

Every API process applies embedded goose migrations before starting its HTTP
server. The package-global `goose.Up` path did not coordinate separate
processes, so a multi-replica rollout could let several pods inspect and apply
the same pending version concurrently.

The planned runtime uses a pooled Neon connection. Neon uses PgBouncer in
transaction mode, where server connections are assigned per transaction and
session-level advisory locks are unsupported. A migration lock tied to one
database session is therefore not a valid coordination primitive for the
pooled application URL.

## Decision

Startup creates an instance-scoped, context-aware `goose.Provider` and supplies
goose's PostgreSQL table locker. The `goose_migration_lock` row is protected by
a renewable 30-second lease with a five-second heartbeat. Lock acquisition has
a one-second base retry interval and a 60-retry threshold; caller cancellation
ends the wait sooner. Unlock has a one-second base retry interval and a
ten-retry threshold. Goose detaches unlock from caller cancellation so cleanup
still has a bounded retry opportunity during shutdown.

The table locker uses ordinary PostgreSQL table operations and does not require
one server connection to persist across transactions. The Provider disables
goose's package-global Go migration registry. Before applying SQL, it obtains
the lease and re-reads the applied version set under that lease. The HTTP server
starts only after migration startup succeeds.

The local integration suite exercises PostgreSQL directly rather than Neon or
PgBouncer. A disposable Neon branch using the production connection mode
remains a release gate. Any future migration that needs session state requires
a separate direct migration connection and a new decision.

## Consequences

Concurrent replicas serialize startup without a separate migration workload. A
crashed holder stops heartbeating and another replica can acquire the lock after
the lease expires. The database role must be allowed to create and update both
goose metadata tables.

Integration tests start eight independent pools against a pristine PostgreSQL
database, invoke migration concurrently, and require one applied record per
embedded version plus a released lock row. The same test holds the lease and
proves that another waiter returns on caller cancellation. Every migration
round-trip test now uses an instance-scoped Provider instead of package-global
goose state.

References:

- [goose table locker](https://pkg.go.dev/github.com/pressly/goose/v3@v3.27.2/lock#NewPostgresTableLocker)
- [goose Provider](https://pressly.github.io/goose/documentation/provider/)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
