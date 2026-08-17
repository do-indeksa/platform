# 0061 - Separate API liveness from database readiness

**Status:** accepted - 2026-08-17

## Context

The Go service exposed only `GET /healthz`. It returned success whenever the HTTP
router was alive and did not check Postgres, although authenticated product
traffic requires the database. Using that endpoint as a Kubernetes readiness
probe could keep routing requests to a process that could answer HTTP but could
not serve the product.

A database outage is not, by itself, evidence that restarting the API process
will help. Coupling the database to liveness could instead restart every replica
during a shared dependency incident and increase recovery load.

## Decision

`GET /healthz` remains a dependency-free process liveness probe and returns
`200 ok`. `GET /readyz` calls `pgxpool.Pool.Ping` with a request-derived
two-second deadline. It returns `200 ready` after a successful round trip and
`503 not ready` for every error or timeout.

Both endpoints return minimal, non-cacheable plain text. Readiness responses do
not expose connection strings, hosts, database errors, or timing details. The
routes pass through the application security-header middleware but are intended
for direct in-cluster probes; Cloudflare Tunnel does not publish API probe paths.

The image smoke test waits for readiness before asserting migrations. It then
stops Postgres and proves that readiness degrades to `503` while liveness remains
`200`, restarts Postgres, and waits for readiness to recover. A Kubernetes
readiness probe must set `timeoutSeconds` to at least three seconds so the
application's two-second dependency deadline owns the failure. This decision
does not change deployment manifests or live infrastructure.

## Consequences

Kubernetes can stop sending Service traffic to a replica that has lost its
required database without restarting a healthy process. Readiness automatically
recovers when a bounded Ping succeeds again. Liveness remains cheap and cannot
amplify a shared Postgres incident through restart loops.

The readiness check deliberately excludes Google OAuth and other optional
upstreams. Adding a dependency requires evidence that all routed product traffic
is unusable without it; otherwise its own outage must not remove the API from
service.

References:

- [Kubernetes liveness and readiness probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/)
- [`pgxpool.Pool.Ping`](https://pkg.go.dev/github.com/jackc/pgx/v5/pgxpool#Pool.Ping)
