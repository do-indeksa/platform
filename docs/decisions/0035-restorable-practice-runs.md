# 0035 - Restorable practice runs

**Status:** accepted - 2026-08-13

**Context.** A browser practice set groups one to 30 tasks and may revisit an
exam position or retry one task several times. The API previously persisted
those checks only as unrelated standalone attempts. Its generic `practice` run
contract could not prove that an accepted assignment, retry sequence, or draft
would be restorable after a reload or on another device.

**Decision.** A practice run whose items all include `answerPartCount` uses the
strict contract shared with current diagnostics and simulations. No snapshots
retain the legacy contract, a complete snapshot enables strict validation, and
a partial snapshot fails closed. A retry may omit the marker or repeat matching
values, but it never upgrades a stored legacy run in place.

A strict practice assignment contains one to 30 immutable FTN P1 task
snapshots. It uses qualified blueprint and SHA-256 content revisions,
deterministic UUIDv5 run-item identifiers, no deadline or score fields, and an
exact answer-part count per item. Task IDs are unique; exam positions may
repeat because a focused set can contain several tasks from one position.

Each item has at most 20 deterministic UUIDv5 AUTO attempts. Attempts are
append-only and globally causal, carry exact-length bounded JSON answer arrays,
and never decrease the highest help level already used for that item. After the
first attempt, submission timestamps strictly increase at browser millisecond
precision so every client can reconstruct the global order without a
database-only identifier. Incorrect answers permit another attempt. Correct and
skipped answers are terminal.

The mutable checkpoint uses the existing optimistic version. Each draft is a
versioned payload containing its exact answer array, help level, and next
attempt number. Recording a matching attempt atomically consumes that item's
draft without incrementing the checkpoint version. An idempotent retry repairs
a matching stale draft left by an older writer, while a conflicting draft is
never discarded. A checkpoint may retain drafts for several unfinished tasks
and point to any task in the assignment.

Submission is deliberately partial: at least one valid attempt must exist, but
the user may finish without visiting every task. Submission removes the mutable
checkpoint transactionally and cannot reduce its accumulated active duration.
Attempt, checkpoint, and submit writes serialize on the parent run row, so
validation and transitions cannot interleave. No GraphQL schema or database
migration is required.

**Consequences.** Every strict practice payload accepted by the API has a
bounded assignment, complete retry history, and enough draft metadata for a
client to restore it deterministically. Existing standalone attempts and
practice runs without the snapshot marker keep their rolling-compatible
behavior. Browser lifecycle wiring is delivered separately from this server
contract.
