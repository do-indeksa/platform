# 0014 - Bounded completed-simulation archive

**Status:** accepted - 2026-08-11

**Context.** The browser kept completed mock exams only in local storage. Reusing
the general `Run` graph for a 20-row archive would expose a heavy nested query,
and resolving each summary separately would create N+1 database reads.

**Decision.** GraphQL exposes an authenticated `completedSimulationRuns`
projection limited to 20 submitted simulation runs. The service loads runs,
items, and each item's latest attempt in three owner-scoped batch queries. The
flat projection stays within the global GraphQL complexity cap.

The web client strictly validates the projection, keeps remote rows in memory,
and merges them with owner-scoped local history by run UUID. A richer local row
wins only when its immutable facts match the server projection; otherwise the
server remains authoritative. Binary automatic outcomes rebuild a full result.
A partial or zero-point result is also reconstructable when the archive
explicitly identifies the latest attempt as `RUBRIC_SELF`; ungraded or unknown
grading remains visible without being coerced into a trusted review.

**Snapshot boundary.** Assignments, answers, grading, points, and content/task
revisions are immutable server data. Canonical statements and solutions remain
in git and are not copied into user storage. A revision mismatch preserves the
stored score and answers, warns the user, and labels the displayed educational
content as the current version.

**Consequences.** Completed mock results work across devices without a Next.js
proxy or database N+1. Active cross-device resume and exact rendering of removed
historical content remain separate future work.
