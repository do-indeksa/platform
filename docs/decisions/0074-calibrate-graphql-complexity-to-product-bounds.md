# 0074 - Calibrate GraphQL complexity to product bounds

**Status:** accepted - 2026-08-17

## Context

The fixed GraphQL complexity ceiling was 2,000. Exact operations used by the
current web client exceeded it: the 250-entry attempt journal cost 3,750,
complete practice recovery cost 2,685, and the completed simulation archive
cost 2,140. The maximum legal run projection cost 3,098. All were rejected
before resolver execution even though their arguments stayed within product
limits.

The cost model was also inconsistent with server work. `Run.items` assumed ten
elements although a general run may contain 100. Checkpoint drafts, summary task
IDs, and training-builder quantities had no effective list multiplier. Root run
and history resolvers load bounded aggregates even when the client selects few
response fields, but that mandatory database work contributed no weight. Other
database-backed query roots had no fixed I/O weight. Raising the old ceiling
without correcting those weights would admit cheap-looking aliases that repeat
expensive reads.

## Decision

The selected-operation ceiling is 33,500 weighted work units. Complexity uses
the same exported domain constants as validation and persistence contracts:

- a run read carries a 2,201-unit baseline for one run, up to 100 items, 20
  recent attempts per item, and 100 checkpoint drafts;
- each run summary carries a 201-unit baseline for its run, item scan, and
  latest-attempt scan;
- each completed simulation carries a 21-unit baseline for its run and ten
  item/attempt projections, while each journal attempt carries one unit;
- each database-backed single-row query carries a 1,024-unit baseline, limiting
  a minimal selected operation to at most 32 such root reads;
- run items, checkpoint drafts, summary task IDs, completed-simulation items,
  recent attempts, and training-builder quantities use their authoritative
  maxima as multipliers.

Scalar lists such as `RunSummary.taskIds` receive a fixed list cost. They do not
multiply gqlgen's child complexity because scalar fields have no child selection
and therefore report zero.

List arguments above their declared maximum are accounted at that maximum and
then rejected by existing input validation. Values below one retain resolver
validation instead of turning malformed input into an arithmetic edge case.

Tests execute every current first-party read document plus the maximum legal
run projection. The latter costs 33,215 units and therefore fits with only 285
units remaining. Duplicated maximum run or history projections, two maximum run
indexes, and 33 one-row database roots exceed the ceiling and fail before
session lookup or resolver database access. Unit tests pin each multiplier,
baseline, and complete-operation cost to the corresponding product contract.

The 256-KiB envelope, 16-KiB document, 4,096-token parser, 1,000-entry query
cache, POST-only transport, disabled introspection, one-command mutation rule,
20-second request deadline, and 64-request default admission bound remain
independent controls. This decision supersedes only the 2,000-unit execution
budget stated in ADR 0045.

## Consequences

Existing bounded product flows are executable without weakening protection
against repeated heavy root fields. The number is a relative work budget, not a
byte count, timeout, database-query limit, or per-client rate limit. Any change
to resolver I/O or product cardinality must update the shared bound, weights,
and boundary tests together. No GraphQL schema, database, frontend, content,
dependency, or deployment change is introduced.
