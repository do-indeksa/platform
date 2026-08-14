# 0065 - Bound and index expired authentication cleanup

**Status:** accepted - 2026-08-14; batch execution refined by
[0074](0074-batch-expired-auth-cleanup.md).

## Context

The API removes expired sessions and one-time OAuth handoff codes during startup
and once per hour afterward. Startup cleanup is covered by the shared database
initialization deadline from ADR 0064, but the recurring loop previously passed
the process-lifetime context directly. A blocked delete could therefore occupy
a pool connection until process shutdown.

Both deletes use a range predicate on `expires_at`. The session table had only
its token primary key and user index, while the auth-code table had only its
code primary key. PostgreSQL therefore had no expiry-ordered access path as
these tables grew.

## Decision

Each hourly cleanup invocation receives one 30-second context derived from the
process context. Session and auth-code deletion remain sequential within that
single budget, and the loop never overlaps runs. A database error or operation
deadline is logged; cancellation inherited from process shutdown returns
without an expected-error record.

Migration 12 creates named B-tree indexes on `sessions.expires_at` and
`auth_codes.expires_at`. B-tree is PostgreSQL's default index method and supports
the cleanup query's `<=` range predicate. The down migration removes only those
indexes.

Tests drive a real timer expiry and parent cancellation. The auth migration
integration test applies, rolls back, and reapplies the indexes against
PostgreSQL while proving existing session and auth-code rows survive rollback.

## Consequences

Scheduled housekeeping has a bounded opportunity to consume a pool connection,
and PostgreSQL can choose an expiry index instead of scanning an entire auth
table. The planner may still prefer a sequential scan for a small table or when
most rows are expired; the indexes provide an access path rather than forcing a
plan.

The indexes add storage and write maintenance, including when a sliding session
extends its expiry. ADR 0074 later replaced each unbounded delete with short,
non-overlapping batches while retaining this deadline and both indexes.

The migration uses a normal transactional `CREATE INDEX`, which can block writes
while each index is built. This is appropriate while the auth tables are small.
Before applying it to a populated production database, the release gate must
verify the lock window or replace it with a separately reviewed non-transactional
`CREATE INDEX CONCURRENTLY` migration.

References:

- [PostgreSQL B-tree indexes](https://www.postgresql.org/docs/18/indexes-types.html#INDEXES-TYPES-BTREE)
- [PostgreSQL CREATE INDEX](https://www.postgresql.org/docs/18/sql-createindex.html)
- [Go context WithTimeout](https://pkg.go.dev/context#WithTimeout)
