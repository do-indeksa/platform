# 0057 - Fail-fast API runtime configuration

**Status:** accepted - 2026-08-14

## Context

The API validated OAuth settings before opening its database pool, but passed
`DATABASE_URL` directly to pgx. An empty pgx connection string can inherit
ambient `PG*` variables instead of proving that the deployment supplied an
explicit database target. The HTTP port was validated by `ListenAndServe` only
after pool creation, migrations, and auth cleanup had already run.

Parser errors for malformed connection strings may contain connection details.
Returning those errors to the process logger could disclose a database host,
user, or password while reporting a configuration failure.

## Decision

The process loads and validates one runtime configuration before registering
signals, creating the pool, running migrations, or starting background work.
Required auth values are checked in a deterministic order.

`DATABASE_URL` must be present and parse successfully with pgx. Missing and
invalid values return fixed errors; the parser error and raw connection string
are intentionally not wrapped. Runtime wiring passes the parsed pool
configuration to `pgxpool.NewWithConfig`, so there is no second parse or
ambient-only fallback when the variable is empty. Pgx keeps its standard
libpq-compatible behavior for fields omitted from a non-empty connection
string.

`PORT` defaults to `8080`. An explicit value must contain only decimal digits
and resolve to a port from 1 through 65535. The validated value is normalized
before it becomes the HTTP listen address.

## Consequences

Invalid deployments stop before database or background side effects and log
only the failing variable contract, not its value. Existing valid URLs, pgx
pool query parameters, defaults for omitted fields, and the default listen port
keep their behavior.

Configuration parsing does not claim that PostgreSQL is reachable. Migrations
still prove startup access, while `/healthz` remains a process-liveness endpoint
rather than a database-readiness claim.

References:

- [pgxpool ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool#ParseConfig)
- [Go strconv ParseUint](https://pkg.go.dev/strconv#ParseUint)
