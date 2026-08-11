# 0018 - Archive verified task revisions by content hash

**Status:** accepted - 2026-08-11

**Context.** Attempts and run items retain `sha256:<digest>` revisions, but Git-backed current content alone cannot reproduce an older statement and solution.

**Decision.** Store the exact verified Markdown bytes at `content/snapshots/tasks/<task-id>/<digest>.md`. Generation is create-only and idempotent. CI verifies path, SHA-256, task ID, topic, verified status, current coverage, and rejects modification, deletion, or rename relative to the base revision.

**Boundary.** The archive contains canonical Markdown only. Runtime consumers resolve it server-side and render through the shared sanitized Markdown pipeline; neither rendered HTML nor task copies belong in the database.

**Consequences.** Every published revision can remain addressable without mutable aliases or user-owned content copies, at the cost of permanent append-only repository growth.

**Implementation status - 2026-08-11.** The web runtime resolves a strictly validated task ID and SHA-256 through the canonical task parser, rechecking bytes, identity, topic, and verified status. Task and completed-mock history links carry only public revisions. The server supplies at most one archived candidate per task; the client selects an individual attempt after an exact owner-scoped match and selects a mock-exam set atomically only when its content revision, ordered task IDs, and every task revision match the hydrated run. Historical grading uses the same resolved tasks. A missing or tampered revision falls the whole mock result back to current content with an explicit warning; legacy history remains current without claiming archival fidelity. Retry actions always use current tasks.
