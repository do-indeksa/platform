# 0040 - Sync explicitly saved Training Builder drafts

**Status:** accepted - 2026-08-13

**Context.** ADR 0020 gave manually saved Training Builder compositions an
owner-scoped browser key. That prevents leakage between accounts on one device,
but a signed-in student still gets a different saved composition in each
browser. A Builder draft is ordinary product state: it describes a future
practice set before selection and does not contain an active run, answers, or
attempt progress. Keeping the account copy only in `localStorage` therefore
contradicts the server-state boundary in `docs/ENGINEERING.md`.

**Decision.** An authenticated user owns at most one Training Builder draft in
Postgres. The record contains the current blueprint version, ten fixed bounded
P1 position quantities, difficulty, and the three selection switches. It is a
structured feature table rather than arbitrary JSON. Database constraints and
service validation both limit every position and the complete composition to
ten tasks. The owner always comes from the authenticated session.

GraphQL exposes a nullable owner-scoped query and an atomic full-replacement
mutation. Every row has a monotonically increasing version. Creation expects
version zero and replacement expects the exact last-read version. A stale
writer receives `CONFLICT`, reads and displays the current server draft, and
requires a second explicit save after review. There is no autosave: only the
existing Save command creates or replaces the server record.

After a successful read, the server is authoritative and refreshes the
validated account cache. If no server row exists, the client may seed it once
from that same account's scoped cache. Concurrent creation reads back the
winner. An unavailable server keeps the scoped cache as a degraded read
fallback, but an unknown server version must be read before a later write.
Failed or mismatched write acknowledgements never replace the fallback.

A server draft whose blueprint or quantities are incompatible with the current
catalog is not activated or cached. Its server version is retained so the
student can explicitly replace the stale record with a current composition
without an artificial conflict. Guest drafts remain local and are never
uploaded automatically. Owner changes keep the neutral loading boundary and
abort stale reads and writes.

The Builder draft contract ends when practice starts. The selected immutable
assignment and any active answers or checkpoint continue to use the practice
run contracts from ADR 0035; they are not embedded in this record.

**Consequences.** A signed-in student's explicitly saved composition restores
across devices without exposing another owner or silently overwriting a newer
choice. Offline editing and starting practice remain possible, but a signed-in
Save reports success only after server acknowledgement. This decision
supersedes only ADR 0020's account-local synchronization limitation; its guest,
legacy-key, and owner-transition rules remain in force. No visual redesign,
content change, or deployment is part of this slice.
