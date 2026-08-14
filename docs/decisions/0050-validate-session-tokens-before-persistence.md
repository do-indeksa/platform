# 0050 - Validate session tokens before persistence

**Status:** accepted - 2026-08-14; extends
[0029](0029-host-prefixed-session-cookies.md) and
[0049](0049-lazy-graphql-request-identity.md).

**Context.** Session tokens are canonical unpadded base64url encodings of 32
random bytes. The auth service nevertheless hashed every configured session
cookie value and queried PostgreSQL, even when its length, alphabet, padding,
or trailing bits proved that the value could not have been issued by the
service. GraphQL delayed that lookup until resolver execution, but valid
operations with malformed cookies still consumed a connection. The current
user, logout, and account-deletion HTTP handlers had the same persistence
dependency.

**Decision.** Every auth service entry point validates the session token's
canonical encoding before hashing it or calling persistence. Malformed tokens
produce the same domain result as a missing row: session lookup returns
`pgx.ErrNoRows`, logout succeeds idempotently, and account deletion reports no
deleted account. A well-formed unknown token still reaches PostgreSQL exactly
once because only persistence can determine whether it represents a live
session.

**Consequences.** Malformed-cookie traffic cannot consume database pool
capacity or make deterministic authentication rejection depend on database
health. GraphQL continues to return `UNAUTHENTICATED`; current-user and account
deletion continue to return HTTP 401; logout continues to clear the cookie and
return HTTP 204. Token entropy, hashing, cookie policy, and valid-session
sliding expiry are unchanged.
