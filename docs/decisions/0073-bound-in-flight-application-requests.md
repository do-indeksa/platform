# 0073 - Bound in-flight application requests per process

**Status:** accepted - 2026-08-17

## Context

The API bounds request headers, targets, bodies, GraphQL parsing and complexity,
handler execution time, and its PostgreSQL connection pool. Those controls do
not limit how many `net/http` handler goroutines can concurrently enter
application code. During a burst, admitted requests could therefore accumulate
while waiting for the database pool or OAuth provider and retain memory and
scheduling work until their request deadlines expire.

Readiness and liveness must remain observable under that pressure. Applying one
limit to the entire router would let application traffic consume every slot and
make probes report an admission failure rather than the process and database
state they are intended to measure.

## Decision

The API places a non-blocking semaphore around matched GraphQL, OAuth, account,
and legacy product routes. The per-process limit defaults to 64. Operators may
set `MAX_IN_FLIGHT_REQUESTS` to an ASCII decimal value from 1 through 256;
missing input selects the default and every other non-empty value fails runtime
configuration before network activity.

The limiter runs after the shared request ID, access log, panic recovery,
no-cache, security-header, and unsafe-origin middleware. Cross-origin rejection
therefore takes precedence and does not consume application capacity. A request
that cannot immediately acquire a slot receives fixed JSON error code
`server_busy`, HTTP status `503`, and `Retry-After: 1`; it is not queued and does
not enter the application handler. A deferred release returns the slot after
normal completion or panic. `/healthz` and `/readyz` are registered outside the
limiter.

## Consequences

Each process now has a deterministic ceiling on concurrently admitted
application work, including requests waiting on bounded downstream resources.
Overload fails quickly while probes continue to expose liveness and database
readiness. The existing request deadline still bounds every admitted request.

The ceiling is per process, so replicas multiply total concurrency. It does not
bound accepted TCP connections or all `net/http` goroutines, allocate fairly
between clients or endpoints, implement a per-identity rate limit, retry failed
requests, autoscale workloads, or replace edge traffic controls. Changing the
default or upper bound requires capacity evidence and a reviewed code change.

References:

- [Go buffered channels](https://go.dev/ref/spec#Channel_types)
- [HTTP 503 Service Unavailable](https://www.rfc-editor.org/rfc/rfc9110#name-503-service-unavailable)
- [HTTP Retry-After](https://www.rfc-editor.org/rfc/rfc9110#field.retry-after)
