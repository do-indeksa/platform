# 0067 - Classify operational errors before logging

**Status:** accepted - 2026-08-17

## Context

ADR 0066 restricts request and recovery records to allowlisted fields, but
deliberately left operational errors to a separate decision. The API still
passed raw errors from startup, scheduled cleanup, database, provider, and
internal request operations to `slog`.

That boundary is not reliable. A pgx connection error retains the attempted
configuration, including database user, database name, and host. A PostgreSQL
server error can carry message and detail fields derived from schema or query
data. Wrapped, network, and future errors can add equally sensitive text without
changing an existing log call site.

## Decision

Every production operational-error call site passes the source error through
`safelog.Error`. The helper inspects the error chain without rendering it and
returns one structured `error` group with a stable `kind`:

- `none`;
- `canceled`;
- `deadline_exceeded`;
- `postgres`;
- `postgres_connect`;
- `postgres_connection_closed`;
- `network`;
- `network_timeout`;
- `internal`.

A PostgreSQL server error may also emit `error.sqlstate` when its code is
exactly five uppercase ASCII letters or digits. No other error field is
allowlisted. Logs exclude concrete type names, `Error()` output, wrapper text,
PostgreSQL message and detail fields, connection host, user and database values,
query text, network addresses, and request or response data.

Classification gives request cancellation and deadline causes priority, then
handles PostgreSQL server, connection-attempt and closed-connection errors,
followed by generic network errors. Everything else becomes `internal`.
Response status, body, request ID, event message, and log severity remain
unchanged.

## Consequences

Operational records remain useful for alerting and request correlation without
turning an unfamiliar dependency error into a new logging schema. SQLSTATE
preserves a bounded database failure category where it is available.

The application intentionally gives up arbitrary diagnostic text in durable
logs. Investigation uses event counts, request IDs, error kinds, SQLSTATE,
dependency health, and privately governed database metrics. Adding another
field or classification requires a reviewed allowlist change and negative tests
with unique canary values.

The standard library may still preformat `net/http` server failures before the
application sees them. ADR 0066 identified that separate boundary; #335 owns its
replacement with a fixed event and safe classification.

References:

- [ADR 0066](0066-allowlisted-api-request-logs.md)
- [Go structured logging](https://pkg.go.dev/log/slog)
- [pgx PostgreSQL connection errors](https://pkg.go.dev/github.com/jackc/pgx/v5/pgconn)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
