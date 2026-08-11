# 0018 - Archive verified task revisions by content hash

**Status:** accepted - 2026-08-11

**Context.** Attempts and run items retain `sha256:<digest>` revisions, but Git-backed current content alone cannot reproduce an older statement and solution.

**Decision.** Store the exact verified Markdown bytes at `content/snapshots/tasks/<task-id>/<digest>.md`. Generation is create-only and idempotent. CI verifies path, SHA-256, task ID, topic, verified status, current coverage, and rejects modification, deletion, or rename relative to the base revision.

**Boundary.** The archive contains canonical Markdown only. Runtime consumers resolve it server-side and render through the shared sanitized Markdown pipeline; neither rendered HTML nor task copies belong in the database.

**Consequences.** Every published revision can remain addressable without mutable aliases or user-owned content copies, at the cost of permanent append-only repository growth.

**Implementation status - 2026-08-11.** The web runtime resolves a strictly validated task ID and SHA-256 through the canonical task parser, rechecking bytes, identity, topic, and verified status. Task-history links carry only the public revision. The server supplies at most one archived candidate, and the client selects it only after an exact match with the owner-scoped hydrated attempt. A recorded missing or tampered revision falls back to current content with an explicit warning; a legacy attempt without a revision remains on current content without claiming archival fidelity. Per-item archived rendering on the completed mock-exam result remains separate.
