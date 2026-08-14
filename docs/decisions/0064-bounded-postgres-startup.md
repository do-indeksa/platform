# 0064 - Bound PostgreSQL connection and startup work

**Status:** accepted - 2026-08-14

## Context

The API runs embedded migrations and removes expired authentication rows before
opening its HTTP listener. Both operations previously inherited only the
process signal context, so a degraded database could leave a new replica in
startup without an application-owned deadline.

Pgxpool also substitutes a two-minute connection timeout when the parsed pgx
configuration has no positive timeout. Pool construction may continue a
connection attempt after its acquire caller is canceled, and pool shutdown
waits for constructing resources. A startup context alone therefore does not
bound that remaining work when connection establishment is stuck.

## Decision

After parsing `DATABASE_URL`, the application sets `ConnectTimeout` to five
seconds when the URL omits `connect_timeout` or explicitly sets it to zero. A
positive value from one through 30 seconds is preserved. A larger value fails
configuration with a fixed error that contains neither the URL nor connection
details.

Migrations and initial expired-auth cleanup run sequentially under one
two-minute context derived from the process signal context. Cleanup does not run
after migration failure or cancellation. Startup succeeds only if both phases
finish before that shared deadline; only then does the process start its hourly
cleanup loop and HTTP listener.

Deterministic tests cover the default, explicit zero, preserved positive value,
upper limit, shared phase deadline, deadline expiry, parent cancellation, and
safe rejection of an excessive value.

## Consequences

A missing database, stalled TLS handshake, migration-lock wait, migration, or
initial cleanup cannot keep logical initialization alive indefinitely. Process
signals still cancel earlier. Each pgx host attempt that outlives an acquire
cancellation remains independently limited to at most 30 seconds. A multi-host
DSN may still try its finite fallback list sequentially, so deployment
configuration remains a trusted operational input.

The five-second default also applies to connections created later by the pool.
Operators may raise it for a measured environment, but not beyond 30 seconds.
This policy does not add retries or make readiness a startup gate: goose retains
its lease-lock retry behavior, and `/readyz` remains the live post-startup
database signal.

A future Kubernetes workload must use a startup-probe budget longer than two
minutes because no HTTP endpoint exists while initialization is running.

References:

- [pgxpool Config](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool#Config)
- [pgconn Config](https://pkg.go.dev/github.com/jackc/pgx/v5/pgconn#Config)
- [Go context WithTimeout](https://pkg.go.dev/context#WithTimeout)
