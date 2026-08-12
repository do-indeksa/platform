# 0023 - Lease-locked startup migrations

**Status:** accepted - 2026-08-12

**Context.** Every API replica applies embedded goose migrations before serving
traffic. The legacy package-global `goose.Up` call had no inter-process lock, so
concurrent replicas could race while creating the version table or applying the
same pending migration. Production uses a pooled Neon connection. Neon's
PgBouncer transaction mode does not preserve session state and explicitly does
not support session-level advisory locks.

**Decision.** Migration startup uses an instance-scoped, context-aware goose
Provider with the maintained PostgreSQL table locker. The lock is a renewable
30-second lease with a five-second heartbeat. Acquisition retries are bounded
to roughly one minute and release retries to roughly ten seconds; caller
cancellation ends lock acquisition earlier. The Provider disables goose's
package-global Go migration registry.

The lock table is `goose_migration_lock`. It uses ordinary PostgreSQL
transactions, so coordination remains valid through the pooled endpoint. Each
replica re-reads applied versions after obtaining the lock, and only pending
migrations run. API readiness begins only after migration startup succeeds.

**Consequences.** Multi-replica startup is serialized without requiring a
separate deployment job or a direct database URL. A crashed holder can block
other replicas only until its lease expires. The migration role must be able to
create and update both goose metadata tables. Integration tests use independent
connection pools against pristine Postgres to prove concurrent startup,
exactly-once version records, released lock state, and caller cancellation.

References:

- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [goose Provider locking](https://pressly.github.io/goose/documentation/provider/)
