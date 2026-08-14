# 0072 - Calibrate GraphQL complexity to product bounds

**Status:** accepted - 2026-08-14.

**Context.** The fixed GraphQL complexity ceiling was 2,000. Exact operations
used by the current web client exceeded it: the 250-entry attempt journal cost
3,750 and complete practice recovery cost 2,685. Both were rejected before
resolver execution even though their arguments stayed within product limits.

The cost model was also inconsistent with server work. `Run.items` assumed ten
elements although a general run may contain 100. Checkpoint drafts and summary
task IDs had no list multiplier. Root run and history resolvers load bounded
aggregates even when the client selects few response fields, but that mandatory
database work contributed no weight. Other database-backed query roots had no
fixed I/O weight, and training-builder quantities had no list multiplier.
Raising the old ceiling without correcting these weights would admit
cheap-looking aliases that repeat expensive reads.

**Decision.** The selected-operation ceiling is 33,500 weighted work units.
Complexity uses the same exported domain constants as validation and
persistence contracts:

- a run read carries a 2,201-unit baseline for one run, up to 100 items, 20
  recent attempts per item, and 100 checkpoint drafts;
- each run summary carries a 201-unit baseline for its run, item scan, and
  latest-attempt scan;
- each completed simulation carries a 21-unit baseline for its run and ten
  item/attempt projections, while each journal attempt carries one unit;
- each database-backed single-row query carries a 1,024-unit baseline, which
  limits a minimal operation to at most 32 such root reads;
- `Run.items`, checkpoint drafts, summary task IDs, completed-simulation items,
  recent attempts, and training-builder quantities multiply child cost by their
  authoritative maxima.

List arguments above their declared maximum are accounted at that maximum and
then rejected by existing input validation. Values below one retain resolver
validation instead of turning a malformed request into an arithmetic edge case.

Integration tests execute the exact journal, practice-recovery, history, and
archive documents used by the web client, plus the maximum legal run projection.
A single bounded product operation must fit. Repeating a maximum practice
recovery or history selection, or selecting 33 one-row database roots, must
exceed the ceiling and fail before session lookup or database-backed resolver
work. Unit tests pin every multiplier and baseline to the corresponding domain
bound.

The 256-KiB envelope, 16-KiB document, 4,096-token parser, 1,000-entry query
cache, POST-only transport, disabled introspection, one-command mutation rule,
20-second request deadline, and 64-request default admission bound remain
independent controls.

**Consequences.** Existing bounded product flows are executable without
weakening protection against repeated heavy root fields. The number is a
relative work budget, not a byte count, timeout, database query limit, or
per-client rate limit. Any change to resolver I/O or a product cardinality must
update the shared bound, weights, and boundary tests together. No GraphQL schema,
database, frontend, content, or deployment change is introduced.
