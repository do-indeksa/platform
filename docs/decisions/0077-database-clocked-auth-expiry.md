# 0077 - Make persisted authentication expiry database-clocked

**Status:** accepted - 2026-08-17; refines
[0051](0051-refresh-sliding-sessions-on-product-activity.md) and
[0052](0052-require-live-row-for-session-refresh.md)

## Context

Persisted session and OAuth handoff-code rows were validated and removed with
PostgreSQL `now()`, but the API supplied their absolute `expires_at` values from
`time.Now()`. Sliding-session lookup also compared the stored expiry with the
process clock before a second statement assigned another process-clock
timestamp.

Replica clock skew could therefore make a newly persisted row immediately
invalid or extend it beyond the declared lifetime as observed by PostgreSQL.
Two refreshes could also calculate increasing expiries and commit in the
opposite order, allowing the older value to replace the newer one.

## Decision

Production persistence calls pass fixed private TTL constants in whole seconds
rather than application-generated absolute timestamps. Session and handoff-code
insertion stores PostgreSQL `now()` plus the corresponding interval. Session
lookup computes its `refresh_due` projection from the same database clock and
the 15-day refresh window.

The live-row extension from ADR 0052 assigns the greater of the existing expiry
and PostgreSQL `now()` plus the 30-day session TTL. Its
`expires_at > now()` predicate and affected-row contract remain in place, so an
expired or deleted row is not revived and does not authorize a refreshed
browser cookie.

Integration tests bound inserted expiries between database timestamps,
exercise both sides of the database refresh window, and delay a transaction
with an older PostgreSQL timestamp until after a newer extension. Test-only
fixture inserts retain absolute timestamps solely to construct expired, live,
and adversarial states.

## Consequences

Persisted authentication lifetime and validity no longer depend on API replica
clock alignment. Session extension is monotonic even when transactions complete
out of order. Cookie `Max-Age`, session and handoff-code durations, token
formats, cleanup policy, and failure behavior do not change.

Stateless OAuth state and bootstrap tokens cannot use a database timestamp;
they continue to use the process clock with the existing explicit 30-second
skew allowance. This change adds no schema migration, runtime setting,
deployment action, or provider-state change.
