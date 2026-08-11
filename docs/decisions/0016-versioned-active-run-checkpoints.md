# 0016 - Version active run checkpoints separately

**Status:** accepted - 2026-08-11

**Context.** `Run` and `RunItem` preserve an immutable assignment, while
`Attempt` is append-only evidence of checked or submitted work. The diagnostic
and mock-exam runtimes also contain mutable answers, the current item, and
timing state. Treating those drafts as attempts would make incomplete work look
submitted. Blind last-write-wins synchronization would also let a stale device
overwrite newer progress.

**Decision.** An active diagnostic or simulation may own one bounded mutable
checkpoint, stored separately from its run items and attempts. The GraphQL
contract is structured by the server: it accepts the current ordinal, optional
active duration, and at most one bounded draft answer for each item belonging to
the run. It does not accept arbitrary JSON, rendered HTML, task statements,
solutions, grading results, or content from another run.

Every checkpoint has a server version. The first write expects version zero;
each later mutation supplies the version it read and atomically increments it.
A stale version returns `CONFLICT` and never overwrites the current row. The web
client keeps its owner-scoped local state, fetches the server checkpoint, and
requires an explicit recovery path instead of merging divergent answers
silently.

Completed answers remain append-only `Attempt` records. A diagnostic records an
attempt only after an answer is checked or skipped. A simulation keeps answers
as drafts until submission creates the reviewable attempts. `submitRun` and an
explicit idempotent `abandonRun` transition delete the mutable checkpoint in the
same transaction; later checkpoint writes fail with `INVALID_STATE`. Logging
out clears the browser runtime under ADR 0015 but does not implicitly abandon a
server run on another device.

Guest checkpoints remain local. After authentication, a guest run may be
started under the authenticated owner and uploaded with expected version zero.
Server ownership always comes from the session, never from a client-supplied
user ID. Multiple devices may read the same active run, but only a writer based
on the latest server version may advance its checkpoint.

**Snapshot boundary.** A checkpoint is disposable runtime state, not a
historical content archive. Exact old statements and solutions need a separate
immutable, hash-bound snapshot design and server-side safe rendering. Until
that slice exists, history keeps stored task/content revisions, preserves
answers and scores, and warns before showing the current Git-backed content.

**Delivery.** The first implementation slice adds the migration, progress
service methods, GraphQL checkpoint/abandon contract, owner isolation, limits,
optimistic-concurrency tests, and rollback. A later web slice uploads and
hydrates one run kind at a time, starting with diagnostics. No production
promotion is coupled to either code change.

**Consequences.** Cross-device resume can be added without weakening the
meaning of attempts or exposing account state. Offline local work remains
available after a conflict, but concurrent devices require a visible recovery
decision. Mutable drafts are intentionally unavailable in completed history and
cannot substitute for a future canonical content snapshot.
