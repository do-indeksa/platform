# 0051 - Refresh sliding sessions on product activity

**Status:** accepted - 2026-08-14; extends
[0029](0029-host-prefixed-session-cookies.md),
[0049](0049-lazy-graphql-request-identity.md), and
[0050](0050-validate-session-tokens-before-persistence.md).

**Context.** Session lookup extends a PostgreSQL session when less than half of
its 30-day lifetime remains. The current-user endpoint also renewed the browser
cookie, but GraphQL resolvers and the legacy attempts API discarded the
extension result. Product activity could therefore move the database expiry
forward while the browser retained its original expiry and logged an active
user out. GraphQL may resolve multiple root fields concurrently, so applying a
cookie independently in each resolver could also emit duplicate headers.

**Decision.** Request authentication returns the user and an optional prepared
session cookie. The cookie is present only after PostgreSQL successfully
extends the session. HTTP handlers apply it before writing their response. The
GraphQL request identity applies it inside the existing request-scoped
`sync.OnceValues` resolver, so one operation performs at most one extension and
emits at most one refresh header even when root fields execute concurrently.

The current-user and legacy attempts handlers use the same request
authentication result. Fresh, missing, malformed, unknown, expired, and
protocol-rejected sessions do not emit a refresh cookie. A failed database
extension leaves the current request authenticated but does not claim a new
browser expiry.

**Consequences.** Authenticated product activity keeps the database and browser
sliding expiries aligned. Transport and GraphQL validation failures remain
independent of session persistence, and rejected cross-origin requests cannot
refresh a cookie. Session duration, token format, OAuth flows, and the existing
host-prefixed HTTPS and local-development cookie policies do not change.
ADR 0075 later moved the persisted expiry and refresh-window calculation to the
PostgreSQL clock without changing this request-scoped cookie contract.
