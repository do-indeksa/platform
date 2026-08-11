# 0017 - Keep rubric self-check separate from automatic grading

**Status:** accepted - 2026-08-11

**Context.** FTN P1 awards up to 60 points across ten tasks and may award
partial credit for a written method. The web checker can reliably compare many
final answers, but it cannot inspect work written on paper. Treating every
wrong final answer as an official zero loses useful practice information;
presenting a user-selected method score as independent grading would be equally
misleading.

**Decision.** A reviewed task may define a bounded rubric whose criteria sum to
one point below the task maximum. For the current six-point P1 positions, an
exact final answer remains an `AUTO` result worth six points. A non-exact or
missing final answer may enter a separate self-check and receive zero to five
points based only on steps visibly present in the learner's written work.

The automatic result is persisted first as a deterministic `AUTO` attempt while
the run remains active. Every explicitly assessed rubric task uses another
deterministic attempt ID and `RUBRIC_SELF` grading kind. Positive rubric scores
produce `PARTIAL`; zero preserves `INCORRECT` or `SKIPPED`. The final run is
submitted only after all eligible rubric tasks are assessed. The exam
submission timestamp is frozen before grading, so review time does not change
the measured exam duration or timeout result.

Rubric criteria live in Git-backed task content and are allowed only on
independently `verified` tasks. Content validation bounds every criterion,
rejects duplicate IDs, and verifies the total against the task maximum. Serbian
Latin text remains canonical; interface framing and warnings are localized to
`sr-Latn`, `en`, and `ru`. The initial pilot covers nine tasks across complex
numbers, quadratic equations, and logarithms.

The browser persists the `reviewing` phase and selected scores. While review is
active, selections use a bounded versioned checkpoint draft, so a score can be
changed without mutating an append-only attempt. A signed-in run uploads the
full automatic layer without calling `submitRun`, allowing another device to
recover the frozen answers, submission time, and interrupted review. Active-run
reads may return at most the deterministic automatic and rubric attempts per
item; a score disagreement is a conflict, never last-write-wins. Guests keep the
same state locally and claim the final outbox after authentication.

Completed history stores explicit rubric scores, including zero. The bounded
archive exposes the latest attempt's grading kind so a partial score can be
reconstructed without guessing its provenance. Exact statements and solutions
remain outside user storage under the existing content-snapshot boundary.

**Consequences.** The result can represent useful method credit while clearly
remaining a self-assessed trainer estimate, not an official FTN grade.
Automatic evidence is never overwritten, retries remain idempotent, interrupted
review is resumable, and no database migration is needed. The tradeoff is that
rubric quality and coverage are now an explicit content-review responsibility;
tasks without a reviewed rubric continue to use final-answer-only estimates.
