# 0018 - Archive verified task revisions by content hash

**Status:** accepted - 2026-08-11

**Context.** Attempts and run items retain `sha256:<digest>` revisions, but Git-backed current content alone cannot reproduce an older statement and solution.

**Decision.** Store the exact verified Markdown bytes at `content/snapshots/tasks/<task-id>/<digest>.md`. Generation is create-only and idempotent. CI verifies path, SHA-256, task ID, topic, verified status, current coverage, and rejects modification, deletion, or rename relative to the base revision.

**Boundary.** The archive contains canonical Markdown only. Database copies, rendered HTML, API lookup, runtime parsing, and history UI integration require a separate resolver slice.

**Consequences.** Every published revision can remain addressable without mutable aliases or user-owned content copies, at the cost of permanent append-only repository growth.

**Implementation status - 2026-08-11.** The web runtime now resolves a strictly validated task ID and SHA-256 through the canonical task parser, rechecking bytes, identity, topic, and verified status. Binding that server result to a hydrated history entry remains a separate UI slice.
