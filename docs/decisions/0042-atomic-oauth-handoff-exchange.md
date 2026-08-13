# 0042 - Atomic preview OAuth handoff exchange

**Status:** accepted - 2026-08-13.

**Context.** Google OAuth callbacks always reach the canonical origin. A sign-in
started on an allowed preview origin therefore continues through a short-lived,
browser-bound handoff code. The exchange previously deleted that one-time code
before inserting the preview origin's session. A session insertion failure left
the browser unauthenticated and made the still-current handoff impossible to
retry.

**Decision.** Preview handoff consumption and session insertion run in one
database transaction. Session entropy is generated before opening the
transaction. A matching unexpired code is deleted, its stored return path is
revalidated, and the session is inserted before commit. The handler sets the
session cookie only after that commit succeeds.

Any failure before commit rolls back both writes, so a valid handoff can be
retried. Concurrent exchanges still serialize on the deleted row and at most one
committed transaction can create a session. Expired, mismatched, and reused
codes retain the same `invalid_code` response. As with any database transaction,
a connection failure during commit can leave the caller unable to determine the
outcome; the handler does not claim success or clear the browser binding in that
case.

A stored unsafe return path remains a fail-closed exception: its transaction
commits code consumption without inserting a session. This prevents repeatedly
presenting corrupted durable state while preserving the return-path boundary
from ADR 0027.

**Consequences.** The HTTP and OpenAPI contracts, browser-binding checks,
session lifetime, and cookie attributes do not change. Canonical-origin sign-in
continues to issue its session directly after the Google callback; this decision
only covers preview-origin handoff exchange.
