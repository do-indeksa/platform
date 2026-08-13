# 0038 - Durable diagnostic baseline

**Status:** accepted - 2026-08-13

**Context.** The preparation plan previously learned that a diagnostic had
finished only from the owner-scoped browser runtime. Correct and incorrect
attempts also establish that fact indirectly, but skipped attempts are
intentionally absent from the mastery projection. A submitted all-skipped
diagnostic therefore disappeared on a clean device. The aggregate History feed
cannot be the durable fallback because it is intentionally bounded to the most
recent 100 runs.

**Decision.** The product GraphQL API exposes `latestSubmittedRun(kind)` as a
nullable, owner-scoped completion marker independent of feed limits. Its query
filters by owner, kind, and submitted status and uses the canonical submission
time. A partial index supports that access path.

The web History query requests the latest submitted diagnostic marker alongside
the bounded feed. Both values share the same owner generation, latest-request
wins rule, degraded state, and post-submit refresh lifecycle. A failed refresh
retains the last visible marker; an owner transition clears it.

The preparation plan combines that server marker with a completed local
diagnostic. It considers either source sufficient to establish the baseline and
uses the completion or submission timestamp, rather than the start timestamp,
for the current-day action.

**Consequences.** A completed diagnostic remains a baseline after any number of
newer runs and across devices, including when every answer was skipped. Active,
abandoned, or another owner's runs cannot establish completion. Guest planning
remains local-only, and the History feed keeps its bounded presentation
contract.
