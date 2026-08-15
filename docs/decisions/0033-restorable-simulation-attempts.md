# 0033 - Restorable simulation attempts

**Status:** accepted - 2026-08-13

**Context.** A simulation run stored task identity, position, points, and
revision, but not the number of answer fields. The API therefore accepted
answers whose JSON shape could not be restored by the web client. It also
accepted arbitrary attempt IDs, timestamps, and grading transitions. A valid
write could leave an active run or completed archive unreadable.

**Decision.** New web clients snapshot `answerPartCount` on every run item.
The nullable database and GraphQL field is the rolling-version marker: a
simulation with a complete snapshot uses the strict contract, while rows and
queued writes created before this decision remain legacy-compatible. A retry
may omit the snapshot or repeat it, but it never upgrades an existing legacy
run in place because that run may already contain legacy attempts.

Strict simulation items use UUIDv5 identifiers derived from the run and task.
AUTO and RUBRIC_SELF attempts use distinct UUIDv5 identifiers derived from the
run item. Every attempt shares the run start and final submission timestamps,
uses help level zero, and stores an exact-length JSON string array bounded by
the task-field limits. AUTO outcomes carry binary points. RUBRIC_SELF can only
follow the matching committed AUTO layer with the same frozen answer and can
only express an eligible zero or partial score.

Submitting a strict simulation requires one valid AUTO attempt for every item.
An optional matching RUBRIC_SELF layer may follow it. The run lock already
serializes submission against attempt writes, so this completeness check and
the status transition are atomic. Archive queries continue to expose the final
layer per item.

**Consequences.** Current-client runs accepted by the API can be reconstructed
by the same web parsers after a reload or on another device. Rubric credit no
longer overwrites the evidence of the automatic grade. Legacy runs retain their
previous permissive behavior until completion instead of being partially
converted to a contract they may not satisfy.
