# 0032 - Causal run timestamps and submission retries

**Status:** accepted - 2026-08-13

**Context.** A run-linked attempt was validated only against its own elapsed
interval. It could therefore start before its immutable parent run. A run could
also be submitted before an already stored attempt, producing an aggregate that
the web outbox correctly refuses to reconstruct. Finally, `submitRun` treated
every call against an already submitted run as a successful retry, even when
the new timestamp or active duration contradicted the committed submission.

**Decision.** A run-linked attempt must start at or after `run.startedAt`. A
submission must occur at or after every stored attempt for that run. Attempts
may still be uploaded after a simulation deadline: delayed and offline sync is
valid, while the four-hour active-duration ceiling remains authoritative.

`submitRun` normalizes timestamp and duration into the same canonical values on
the initial write and every retry. A retry succeeds only when those values equal
the committed submission; otherwise it returns `CONFLICT`. A matching retry
still deletes an impossible leftover checkpoint transactionally.

Attempt writes retain a shared lock on the parent run. Submission takes an
exclusive lock before checking later attempts. Consequently, concurrent writes
cannot commit an attempt after a causally earlier submission: either the
attempt commits first and blocks submission, or submission commits first and
the attempt observes the terminal run state.

For rolling compatibility, `completedSimulationRuns` excludes legacy rows with
missing or causally inverted run-linked attempt timestamps before applying its
result limit. Generic run reads remain fail-closed at the web parser boundary so
an active incompatible row can still be surfaced through recovery UX.

**Consequences.** Stored aggregates satisfy the ordering already required by
the web parser, retry success proves semantic identity, and offline upload is
not confused with exam activity beyond the deadline. No GraphQL schema or
database migration is required.
