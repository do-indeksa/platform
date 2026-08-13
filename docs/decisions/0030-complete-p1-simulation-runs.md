# 0030 - Complete FTN P1 simulation runs

**Status:** accepted - 2026-08-13

**Context.** The generic run aggregate accepted a `simulation` with any
non-empty item set and any total point ceiling up to 60. Completed-run
projections identify simulations by kind, so a partial set could enter the mock
archive and readiness calculations as if it were a complete FTN P1 attempt.

**Decision.** The `simulation` run kind is reserved for a complete FTN P1
snapshot. A new simulation must carry a qualified `ftn-p1:<year>.<revision>`
blueprint, exactly ten unique positions from 1 through 10, exactly 60 total
possible points, immutable SHA-256 content and task revisions, canonical
ordinal-to-position order, and a persisted deadline exactly four hours after
`startedAt`. The API validates the aggregate before opening a transaction.
Practice and diagnostic runs retain their existing flexible item and deadline
contracts.

Web producers send the existing GraphQL `deadlineAt` field for both active and
completed simulations. For rolling compatibility, the API derives the canonical
deadline when an older client omits it, but rejects an explicitly conflicting
value. The completed-run parser performs the same derivation for otherwise
valid local outbox records created before that field was stored.

During a rolling upgrade, an idempotent `StartRun` retry may encounter an older
but otherwise identical complete simulation whose stored deadline is null. The
API accepts only that exact legacy shape, backfills the canonical deadline, and
keeps conflicting retries fail-closed. Archive reads derive the same deadline
for untouched legacy rows and filter structurally incomplete rows before
applying the result limit.

**Consequences.** Anything returned by `completedSimulationRuns` is structurally
a complete P1 mock, while task identity and point distribution remain frozen by
the selected blueprint snapshot. A future official format that changes task
count, duration, or total points requires an explicit version-aware contract
change before such runs can be persisted as simulations.
