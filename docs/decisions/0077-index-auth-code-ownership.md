# 0077 - Index OAuth handoff-code ownership

**Status:** accepted - 2026-08-14.

**Context.** OAuth handoff codes belong to a user through
`auth_codes.user_id`, with `ON DELETE CASCADE`. Unlike every other directly
account-owned collection, the foreign-key column had no leading index. Deleting
one user therefore scanned all handoff codes, including rows owned by unrelated
accounts, before the cascade could remove that user's codes.

Handoff codes expire after 30 seconds, but bounded cleanup runs hourly and may
leave locked rows for a later pass. Their normal short lifetime does not provide
an execution-plan guarantee for account deletion.

A warm-cache PostgreSQL 17 audit with 500,001 handoff codes observed about
17.8 ms in the auth-code foreign-key trigger and 19.3 ms for the complete user
delete. An owner index reduced the trigger to about 0.08 ms and the complete
delete to about 1.1 ms. These measurements demonstrate the access-path change;
they are not portable latency thresholds.

**Decision.** Add a B-tree index on `auth_codes(user_id)`. This gives the
foreign-key cascade a direct owner lookup and matches the existing owner index
on sessions. Migration tests pin the exact definition, prove that the delete
plan can use the index, preserve all handoff-code rows, and exercise an
`up/down/up` round trip.

**Consequences.** OAuth issuance, exchange, browser binding, expiry, cleanup,
and account-deletion semantics do not change. Each short-lived handoff-code
insert and delete maintains one additional UUID index entry. That bounded write
cost prevents account deletion from depending on the global handoff-code table
size.

The migration uses ordinary transactional index creation because this migration
chain precedes a large live handoff-code table. A future equivalent change on a
large deployed table requires an explicitly planned online rollout.
