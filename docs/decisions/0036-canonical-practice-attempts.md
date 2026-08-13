# 0036 - Canonical practice attempts

**Status:** accepted - 2026-08-13

**Context.** A task check inside a restorable practice run was written twice:
once as the deterministic run attempt and once as an unrelated standalone
attempt. Both records reached the attempt journal and mastery projection, so a
single user action could receive double weight. A guest run with attempts was
also removed on completion before it could be claimed after sign-in.

**Decision.** The deterministic run attempt is canonical whenever a workspace
is bound to the practice runtime. Standalone GraphQL attempts remain the
contract only for tasks opened without that runtime binding.

The persisted runtime is also the owner-scoped local projection and retry
source. Completed guest runs with at least one attempt remain in `submitting`
state across reload, are claimed on sign-in, and then drain through the normal
idempotent start, checkpoint, attempt, and submit mutations. A run is removed
only after every attempt is synced and the complete canonical projection has
been acknowledged locally. A bounded in-memory acknowledgement bridges the
interval between successful submission and the next server-journal read.

Existing duplicate rows are not deleted. API and browser projections suppress
a standalone practice row only when a run-bound row matches its owner, source,
task, exam position, start and submission times, answer, outcome, help level,
grading kind, and task revision. A later retry or any non-matching attempt
remains visible.

**Consequences.** One bound task check contributes one journal event and one
mastery observation. Offline and guest work remains visible with stable IDs
until the server accepts it. Historical duplicate storage is preserved for
auditability, while current reads prefer the richer run-bound record. Owner
changes continue to discard another owner's local runtime and transient
acknowledgements.
