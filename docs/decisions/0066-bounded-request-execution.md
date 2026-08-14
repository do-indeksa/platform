# 0066 - Bound HTTP request execution and graceful shutdown

**Status:** accepted - 2026-08-14

## Context

The API already bounded request headers, targets, bodies, GraphQL tokens and
complexity, and socket reads and writes. Those limits did not give handler code
or its database and OAuth calls an absolute request-context deadline. A client
could therefore leave cooperative downstream work alive until its own limit or
connection failure.

The server's write timeout was 30 seconds, while process shutdown waited only
10 seconds for active connections. A request admitted immediately before a
termination signal could outlive that drain budget even when all application
work respected cancellation.

## Decision

The outer HTTP server gives every routed request a 20-second context deadline.
Cancellation already present on the request, including a client disconnect,
wins if it happens earlier. Existing shorter operation budgets remain nested:
OAuth provider exchange and userinfo share ten seconds, and the readiness
database ping has two seconds.

The request-target limit stays outside this middleware, so an oversized target
is rejected before routing or allocating a request timer. The server retains a
30-second write timeout and now allows 30 seconds for graceful shutdown. This
orders the lifecycle budgets as request execution below socket write, with ten
seconds of margin between request cancellation and shutdown expiry.

Current Postgres and provider calls inherit the request context. Handlers keep
their endpoint-specific error behavior; the middleware cancels work but does
not manufacture a generic timeout response or forcibly stop code that ignores
its context.

## Consequences

Cooperative external I/O cannot occupy a request indefinitely, and a normal
termination gives an admitted request enough time to reach its application
deadline and unwind before the process drain ends. Earlier client cancellation
continues to release work sooner.

The limit applies per HTTP request, not to the browser's four-hour mock-exam
runtime. Each checkpoint, answer, or submission remains a short independent
request. The API does not currently support long polling, streaming responses,
or large uploads; adding one requires a separately reviewed timeout policy.

Context cancellation cannot preempt an arbitrary CPU loop. Current GraphQL
body, token, and complexity limits bound the exposed execution surface, but new
handlers and every external call must continue to observe the request context.

A future Kubernetes API workload must set `terminationGracePeriodSeconds`
above 30 seconds; the deployment contract requires at least 35 seconds so the
platform does not force-kill the process at the application deadline.

References:

- [Go HTTP Server timeouts](https://pkg.go.dev/net/http#Server)
- [Go HTTP Server.Shutdown](https://pkg.go.dev/net/http#Server.Shutdown)
- [Go context WithTimeout](https://pkg.go.dev/context#WithTimeout)
