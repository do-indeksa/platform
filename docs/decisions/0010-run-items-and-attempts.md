# 0010 - Separate run items from attempts

**Status:** accepted - 2026-08-10

**Context.** A run must retain its assigned tasks even when no answer exists, while one task can receive multiple submissions.
**Decision.** `runs` own immutable `run_items`; append-only `attempts` optionally reference an item. Client-generated UUIDs make guest synchronization idempotent.
Run items snapshot task, topic, exam position, point ceiling, blueprint, and content revisions, but canonical statements remain in git.
Legacy boolean attempts remain readable while richer outcomes and grading kinds become authoritative for new writes.
**Consequences.** Completed history no longer depends on the current content tree, retries do not mutate assignments, and run lifecycle writes require transactions.
