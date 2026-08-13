# 0041 - Atomic server-owned account deletion

**Status:** accepted - 2026-08-13.

**Context.** A signed-in user can own identity data, multiple sessions, OAuth
handoff codes, attempts, learning runs and checkpoints, preparation preferences,
and saved training-builder drafts. Logout revokes only the current session, and
the API previously had no account lifecycle operation.

**Decision.** Authenticated `DELETE /v1/me` and `/api/v1/me` delete the user
selected by the current unexpired session. Session validation and user deletion
are one SQL statement; there is no read-then-delete authorization gap. Existing
foreign keys cascade the transaction through all server-owned rows. Successful
deletion clears the request's session cookie and invalidates every other session
through the same cascade.

A missing cookie, an expired session, and a session consumed by an earlier
deletion all return the same `401` response. The existing unsafe-request origin
middleware runs before endpoint authentication, so cross-origin deletion is
rejected even when a browser omits the `SameSite` cookie.

**Consequences.** A later Google sign-in creates a fresh account with no previous
progress. The API does not retain an identity tombstone. Browser-local guest and
owner-scoped caches are not server-owned and cannot be deleted by this endpoint;
a future settings UI must clear the active owner's local state only after the
server confirms deletion. That UI, its confirmation interaction, and its Figma
review are separate work.
