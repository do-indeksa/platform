# 0049 - Lazy GraphQL request identity

**Status:** accepted - 2026-08-14.

**Context.** The GraphQL route resolved a session before its endpoint handler
validated media type, body framing and size, GraphQL syntax, document limits,
complexity, or the single-command mutation policy. A request with any cookie
therefore acquired a PostgreSQL connection even when the protocol rejected it
before resolver execution. Invalid traffic could consume database capacity and
made deterministic HTTP rejection depend unnecessarily on database health.

GraphQL query root fields may execute concurrently. Moving session lookup into
each resolver without request-scoped caching would replace the eager lookup
with multiple identical database queries for one operation.

**Decision.** GraphQL middleware installs a lazy identity resolver in request
context. The first resolver that requests the current user performs the session
lookup. `sync.OnceValues` caches both the user and any error for the lifetime of
that request, so subsequent or concurrent root fields observe the same result
without another lookup.

Transport, parsing, validation, complexity, and mutation-policy failures do not
request identity and therefore do not acquire a database connection. Product
resolvers remain authenticated by default through the existing
`RequestContextUser` boundary. HTTP OAuth and legacy REST handlers retain their
endpoint-specific authentication behavior.

**Consequences.** Invalid GraphQL requests are rejected by bounded protocol
work even when PostgreSQL is unavailable or saturated. A valid GraphQL request
performs at most one session lookup, including concurrent multi-field queries,
and failed session lookups are not retried within the same request. Response
codes and GraphQL error contracts for authenticated and anonymous operations do
not change.
