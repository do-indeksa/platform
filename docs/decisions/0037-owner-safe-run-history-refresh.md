# 0037 - Owner-safe run history refresh

**Status:** accepted - 2026-08-13

**Context.** The aggregate run history was loaded only during authentication
bootstrap. A practice or diagnostic run submitted later in the same document
updated the attempt journal but left the training feed stale until reload.
Concurrent bootstrap and post-submit reads could also complete out of order and
restore an older projection.

**Decision.** Owner activation and history refresh are separate operations.
Changing owners clears the projection and advances an owner generation. Reads
within that generation use a separate monotonically increasing refresh
generation, so only the newest request may publish data. An A-B-A owner cycle
cannot reuse the first A generation.

After a practice runtime or diagnostic outbox entry is submitted, acknowledged,
and removed from its durable local queue, the client starts a best-effort
history refresh for that owner. Simulation submission continues to update its
separate simulation archive. A refresh neither delays nor changes the result of
the canonical write lifecycle.

Existing entries stay visible while a refresh is in flight. If its read fails,
the projection becomes `degraded` without discarding those entries. A failed or
unacknowledged submit never starts the refresh.

**Consequences.** A completed training appears in History during normal client
navigation without a document reload. Slow or stale responses cannot cross an
owner boundary or overwrite a newer read. Temporary read failures remain
observable without retrying an already accepted run or losing available
history.
