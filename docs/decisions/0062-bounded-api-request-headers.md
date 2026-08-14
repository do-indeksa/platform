# 0062 - Bound API request headers at the origin

**Status:** accepted - 2026-08-14

## Context

The API already bounded header-read, body-read, response-write, and idle time,
but left `http.Server.MaxHeaderBytes` unset. Go therefore allowed its 1 MiB
default for the request line and request headers. The intended Cloudflare edge
accepts at most 128 KiB of total request headers, so the private origin did not
need a substantially larger parsing budget or an edge-only bound.

The server settings also lived inline in `run`, which made the configured
network policy difficult to verify without starting the complete application.

## Decision

One constructor owns the API `http.Server` settings. It preserves the existing
five-second header-read timeout, ten-second read timeout, thirty-second write
timeout, one-minute idle timeout, address, and handler. It explicitly sets
`MaxHeaderBytes` to 128 KiB.

A real TCP test sends one ordinary request and one request with a materially
oversized header. The ordinary request reaches the handler, while the oversized
request receives `431 Request Header Fields Too Large` without invoking it.

## Consequences

The origin has an explicit parser budget consistent with the public edge and
does not depend on Cloudflare as its only header-size boundary. A request
rejected while Go parses its headers never reaches the router, so it does not
receive an application request ID or create an API access-log record. Edge or
transport telemetry remains the observation point for that rejection.

`MaxHeaderBytes` covers the request line and headers, not the request body.
GraphQL and legacy REST body limits remain independent application contracts.
This decision changes no route, payload limit, Cloudflare rule, or deployment
resource.

References:

- [Go http.Server.MaxHeaderBytes](https://pkg.go.dev/net/http#Server.MaxHeaderBytes)
- [Cloudflare request limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/#request-limits)
