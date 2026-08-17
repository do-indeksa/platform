# 0076 - Batch expired authentication cleanup

**Status:** accepted - 2026-08-17

## Context

ADR 0064 gives startup and hourly authentication retention a fixed deadline and
adds expiry indexes. Each table nevertheless used one
`DELETE ... WHERE expires_at <= now()` statement. A large backlog could place
every expired row in one transaction, retaining all selected row locks and WAL
work until completion or cancellation. Multiple API replicas could also wait
on the same expired rows.

The operation deadline bounds connection occupancy, but it does not bound one
transaction's cardinality or prevent replica overlap.

## Decision

Session and OAuth handoff-code retention each select at most 1,000 oldest
expired rows through the existing `expires_at` index. Rows with the same expiry
are ordered by their primary key. The selection uses
`FOR UPDATE SKIP LOCKED`, and the statement deletes only those selected keys.
The final delete repeats `expires_at <= now()` so a session that no longer
qualifies cannot be removed from a stale selection.

Each statement is its own PostgreSQL transaction. The service alternates one
session batch and one auth-code batch until each table returns fewer than 1,000
deleted rows. An error or parent cancellation stops the drain immediately. The
existing shared two-minute startup deadline, 30-second hourly deadline, and
one-hour schedule do not change.

Unit tests pin table interleaving, immediate error propagation, cancellation
between batches, and cancellation after a final statement. PostgreSQL
integration tests prove the per-statement row bound, oldest-first selection,
multi-batch drain, live-row preservation, nonblocking cleanup during a locked
session extension, and exact delete ownership across concurrent drains.

## Consequences

One cleanup transaction locks and deletes at most 1,000 rows. Concurrent
replicas partition currently available expired rows instead of waiting for one
another. Total rows per invocation remain bounded by the parent deadline rather
than a fixed count, allowing a healthy database to drain a backlog without one
large transaction.

`SKIP LOCKED` intentionally gives an inconsistent view suitable for this
retention queue. Rows locked by another transaction may remain after one worker
reports its table drained; they are handled by the owning worker or a later
scheduled invocation. This change adds no migration, runtime setting, retry,
deployment, or retention-policy change.

References:

- [ADR 0064](0064-bounded-indexed-auth-cleanup.md)
- [PostgreSQL SELECT locking clause](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [PostgreSQL explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html)
