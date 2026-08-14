# 0052 - Require a live row for session refresh

**Status:** accepted - 2026-08-14; extends
[0051](0051-refresh-sliding-sessions-on-product-activity.md).

**Context.** Sliding-session authentication first reads a live session and then
extends it in a separate PostgreSQL statement. The extension was an
unconditional `:exec` query. PostgreSQL reports no error when an update affects
zero rows, so a session deleted between those statements could still produce a
new 30-day browser cookie. A session that expired after lookup could also be
updated back into the future.

**Decision.** The extension statement updates only a row whose `expires_at` is
still in the future and returns its affected-row count through sqlc
`:execrows`. Exactly one affected row means the database session was extended
and permits a refreshed browser cookie. An error or any other row count leaves
the already resolved request user unchanged but does not claim a new browser
expiry.

**Consequences.** Expiry and deletion can win the race between lookup and
extension without being represented as a renewed session. A request that
resolved identity before concurrent revocation may still finish, as it could
before this decision, but it cannot prolong that identity unless PostgreSQL
confirms one live-row update. Session duration, refresh threshold, cookie
policy, and logout behavior remain unchanged.
ADR 0075 later made that live-row update database-clocked and monotonic so an
older delayed refresh cannot replace a newer expiry.
