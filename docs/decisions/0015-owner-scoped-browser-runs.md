# 0015 - Owner-scoped browser learning runs

**Status:** accepted - 2026-08-11

**Context.** Diagnostic and mock-exam runtimes are resumable from local storage.
Their completed history and sync outboxes became account-scoped first, but the
single active runtime still had no owner. On a shared browser, logout or an
account switch could therefore leave the previous student's answers or review
available through a direct route.

**Decision.** Each persisted diagnostic and simulation runtime carries either a
user UUID or explicit guest ownership. While authentication is unresolved,
runtime-driven controls and effects remain inactive. A valid sign-in claims a
guest run; the same owner keeps it. Logout, an invalid owner, or a different
account clears the runtime synchronously before network synchronization starts.
Owner-scoped completed simulation history is retained and merely filtered out
for the new owner.

Store migrations fail closed: legacy runtime data without provable ownership is
discarded. Safe completed history remains available through its separate owner
model.

**Consequences.** Shared-browser account transitions cannot expose another
student's active answers or completed in-memory review. A legacy active run may
be lost once during migration, and signing out intentionally abandons an
account-owned local run. Server-backed active cross-device resume remains
separate future work.
