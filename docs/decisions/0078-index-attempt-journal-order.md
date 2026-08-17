# 0078 - Index attempt-journal ordering

**Status:** accepted - 2026-08-17

## Context

The owner-scoped attempt journal returns a bounded newest prefix and then
presents that prefix chronologically. Its inner query orders by
`coalesce(submitted_at, created_at) desc, id desc`, preserving legacy attempts
that have no submission timestamp. Existing indexes cover `created_at` and
`submitted_at` independently, but neither can satisfy this expression.

PostgreSQL therefore scans and sorts an owner's complete attempt history before
applying the limit. For legacy standalone practice rows it also evaluates the
canonical-attempt anti-join for every scanned row. A PostgreSQL 17 audit with
200,000 rows for one owner and a 100-row journal observed a sequential scan,
200,000 anti-join probes, more than 205,000 shared-buffer hits, and about 505 ms
of execution time.

## Decision

Add a B-tree index on
`(user_id, coalesce(submitted_at, created_at) desc, id desc)`. The keys mirror
the journal's ownership predicate and deterministic newest-first ordering, so
PostgreSQL can stop after the requested prefix. The outer chronological reorder
still operates only on the bounded result.

The same audit with the index used an early index scan, evaluated 100 anti-join
probes, touched about 500 shared buffers, and completed in about 0.2 ms. These
measurements establish the observed plan change; they are not portable latency
thresholds. Migration tests instead pin the exact index definition, require a
limit-first index plan without a sort, preserve every attempt value, and
exercise an `up/down/up` round trip.

## Consequences

Journal semantics, owner isolation, duplicate suppression, limits, and response
ordering do not change. Inserts and deletes maintain one additional narrow
index. The index intentionally does not include journal payload columns: at
most the bounded prefix requires heap lookups, while a covering index would
duplicate substantially more user data.

The migration uses ordinary transactional index creation. The product has not
yet been deployed with a large attempt table; a future equivalent migration
against a large live table must use an explicitly planned online rollout rather
than modifying this historical migration.
