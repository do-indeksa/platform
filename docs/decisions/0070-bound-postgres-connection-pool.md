# 0070 - Bound the PostgreSQL connection pool per process

**Status:** accepted - 2026-08-14

## Context

When `pool_max_conns` is absent, pgxpool uses the greater of four or
`runtime.NumCPU()`. The same application configuration can therefore reserve a
different number of database connections after a process moves to a host or
sandbox exposing a different logical CPU count. That implicit value is
multiplied by the number of API replicas against one finite database connection
budget.

Pgxpool accepts an explicit positive maximum up to the signed 32-bit range and
parses pool minimums independently. A malformed deployment could consequently
reserve far more connections than intended or provide minimums that exceed the
effective maximum. These are configuration errors and must fail before pool
creation, migrations, or network activity.

## Decision

The API applies this per-process pool contract while parsing `DATABASE_URL`:

- an omitted `pool_max_conns` becomes 10, independent of available CPUs;
- an explicit `pool_max_conns` from 1 through 50 is preserved;
- an explicit value above 50 is rejected;
- `pool_min_conns` and `pool_min_idle_conns` must each be between zero and the
  effective maximum.

The connection string is first parsed as a pgx connection config to determine
whether `pool_max_conns` was explicit, then parsed by pgxpool for the complete
pool configuration. Both URL and keyword/value forms retain pgx's structured
parsing rules. Rejections return fixed, credential-free errors and happen
before `pgxpool.NewWithConfig` receives the configuration.

## Consequences

An unconfigured API process now has a stable maximum of 10 database connections.
Operators can lower or raise that value through the standard pgxpool parameter
without changing application code, but values above the application ceiling
require a reviewed code change. Existing explicit values within the bounds keep
their behavior.

The maximum remains per process, so replica count still multiplies the total
possible allocation. Deployment owners must choose a value that leaves room
for migrations, administration, and other database clients. This decision does
not add retries, dynamic resizing, a global connection allocator, or a claim
that configuration parsing proves database availability.

References:

- [pgxpool Config](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool#Config)
- [pgxpool ParseConfig](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool#ParseConfig)
- [Go runtime NumCPU](https://pkg.go.dev/runtime#NumCPU)
