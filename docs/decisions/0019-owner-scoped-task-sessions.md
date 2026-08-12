# 0019 - Owner-scoped Task Workspace sessions

**Status:** accepted - 2026-08-12

**Context.** Task Workspace resumes answer drafts, task-rail statuses, and the
practice clock from `sessionStorage`. The original keys identified only the task
and optional practice. A second account in the same tab could therefore reload
the route and see the previous student's answer, progress status, and elapsed
time.

**Decision.** Every Task Workspace session key includes either a validated user
UUID or the explicit `guest` scope. Authentication must resolve before the
workspace reads, renders, or writes persisted state. A scope transition masks
the previous snapshot synchronously, then hydrates only the new owner's draft,
rail statuses, and clock. Controls that can mutate a draft stay disabled until
that hydration finishes.

The storage version moves to `v2`. Unscoped `v1` values are ignored because the
client cannot prove which account created them. Guest work is isolated rather
than claimed automatically; server-backed guest-to-user migration remains a
separate product decision.

**Consequences.** Shared-tab account transitions preserve each scope without
exposing it to another student. Existing unscoped drafts and clocks are lost
once during migration. This changes persistence only; the Figma layout and task
workflow remain unchanged.
