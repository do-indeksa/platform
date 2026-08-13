# 0031 - Database-safe progress text

**Status:** accepted - 2026-08-13

**Context.** Progress commands accepted free-form GraphQL text after checking
only its requiredness and length. PostgreSQL `text` cannot store embedded NUL
bytes, and direct service callers can also supply invalid UTF-8. Those values
therefore escaped domain validation and surfaced as internal database errors.
Checkpoint drafts rejected NUL independently, but run metadata, task revisions,
standalone targets, and attempt answers did not share that protection.

**Decision.** Every client-provided string persisted by the progress domain must
be valid UTF-8 and contain no NUL byte. Existing byte limits for metadata and
Unicode code-point limits for answers remain unchanged. Required fields remain
non-empty; optional attempt answers retain their existing empty-string
semantics. Intrinsic string validation runs before a transaction is opened,
while relational checks such as run-item ownership stay inside the transaction.

GraphQL presents violations as `BAD_USER_INPUT`. The database remains a second
line of defense, not the component that classifies ordinary client input.

**Consequences.** Database-invalid progress text cannot produce driver-specific
internal errors or partial writes. Serbian and other valid Unicode input remains
supported. Future free-form progress fields must reuse the same database-safe
text invariant before persistence.
