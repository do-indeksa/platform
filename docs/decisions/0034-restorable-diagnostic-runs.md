# 0034 - Restorable diagnostic runs

**Status:** accepted - 2026-08-13

**Context.** The diagnostic browser runtime restores only a complete current
FTN P1 assignment, a contiguous prefix of one AUTO attempt per item, and a
checkpoint for the next unfinished item. The API previously applied the generic
run contract, so it could accept an assignment, answer, or checkpoint that the
same client could not restore after a reload or on another device.

**Decision.** A diagnostic whose items all include `answerPartCount` uses the
strict contract. The snapshot is the rolling-version marker shared with
simulations: no snapshots retain the legacy contract, every item snapshotted
enables the strict contract, and a partial snapshot fails closed. Retries may
omit the marker or repeat matching values, but never upgrade legacy rows in
place.

A strict diagnostic is a ten-position FTN P1 assignment with immutable SHA-256
content and task revisions, canonical ordinal-to-position order, no score
fields, and UUIDv5 run-item identifiers. Each finished item has exactly one
UUIDv5 AUTO attempt with help level zero. Attempts form a causal prefix, carry
an exact-length bounded JSON answer array unless skipped, and cannot overlap the
previous attempt.

The checkpoint points to the next unfinished ordinal and contains at most its
single exact-shape draft. Recording that item atomically clears the consumed
draft and advances the checkpoint ordinal without changing its CAS version, so
the current uploader can still perform its planned versioned checkpoint write.
A stale ordinal using that version returns `CONFLICT` and enters the existing
client recovery flow. Once the checkpoint is canonical, idempotent attempt
retries do not touch it.
If a rolling upgrade finds a current-client attempt committed by the previous
API before its following checkpoint write, either the matching attempt retry or
the current checkpoint write repairs that stale ordinal. Repair is monotonic, so
concurrent retries cannot move a checkpoint backwards.

Submitting a strict diagnostic requires a complete valid ten-attempt prefix.
Attempt writes retain the parent run's shared lock, while checkpoint and submit
writes take its exclusive lock, so validation and each state transition remain
atomic. No GraphQL schema or database migration is required.

**Consequences.** Every current-client diagnostic accepted by the API remains
restorable through the current cloud parser, including the interval between an
attempt write and its following checkpoint write. Existing diagnostics and
queued writes without the marker preserve their prior permissive behavior.
