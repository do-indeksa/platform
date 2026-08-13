# 0039 - Keep signed-in preparation preferences on the server

**Status:** accepted - 2026-08-13

**Context.** ADR 0021 separated Study Plan goal and exam-date settings by
browser owner. That prevents one account from seeing another account's values
on a shared device, but a signed-in student still receives different plans on
different devices. These settings are ordinary product state rather than an
exam-runtime draft, so keeping the account copy only in `localStorage` also
contradicts the server-state boundary in `docs/ENGINEERING.md`.

**Decision.** An authenticated user owns at most one complete preparation
preference record in Postgres: a target from 1 through the current 60-point P1
maximum and a calendar date independent of browser timezone. The user ID always
comes from the session. GraphQL exposes a nullable owner-scoped query and an
atomic replacement mutation.

Every record has a monotonically increasing server version. Creation expects
version zero; replacement expects the exact version last read. A stale writer
receives `CONFLICT`, fetches the current server value, and asks the student to
review and save again instead of silently applying last-write-wins. Database
constraints duplicate the service validation, and the date is projected in
canonical `YYYY-MM-DD` form regardless of Postgres `DateStyle`.

The server is authoritative after a successful read. The validated account
cache remains a non-authoritative degraded read fallback. When the server has
no row, the client may create it once from that same account's existing scoped
cache; a concurrent creator wins and is read back. A failed read or write does
not erase or replace the local fallback, and an unknown server version is read
before any later mutation.

Guest preferences remain local under the explicit guest scope. They are never
uploaded automatically, and neither the old unscoped key nor another account's
key may be claimed. Owner transitions keep the neutral loading boundary from
ADR 0021 and abort stale network work.

**Consequences.** A signed-in student's plan is stable across browsers while
offline fallback remains owner-safe. Settings saves require server
acknowledgement; the UI stays open on unavailable writes and exposes concurrent
changes rather than claiming success. This decision supersedes only the
account-local synchronization limitation in ADR 0021; its guest and ownership
rules remain in force. No visual redesign, content change, or deployment is
part of this slice.
