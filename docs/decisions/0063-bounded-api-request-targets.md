# 0063 - Bound API request targets at the origin

**Status:** accepted - 2026-08-14

## Context

The API caps the complete request line and headers at 128 KiB, consistent with
the intended Cloudflare header budget. Cloudflare independently limits a
request URL to 16 KB. Without an origin-side equivalent, a direct or misrouted
request could send a much larger path and query into application routing than
the public edge contract allows.

OAuth callbacks are the largest expected request targets. Their bounded code
and state values remain materially below 16 KiB.

## Decision

The HTTP server wraps its application handler with a 16 KiB request-target
limit. It counts the bytes in Go's raw `RequestURI`, including the escaped path
and query exactly as received. A target of exactly 16 KiB is accepted; a larger
target receives `414 Request URI Too Long` without invoking the router.

A real TCP test covers an OAuth-sized callback target, the exact limit, and the
first rejected size. It also proves that the rejected request does not reach
the application handler.

## Consequences

The private origin now enforces the same request-target budget as the public
edge. The check occurs after `net/http` parses the request but before the Chi
router, so it bounds application routing and query work rather than the initial
header read. The independent 128 KiB server header budget remains responsible
for that read.

Pre-router rejections do not receive an application request ID or create an API
access-log record. Edge or transport telemetry remains the observation point.
Request-body, GraphQL document, and field-complexity limits are separate and do
not change.

References:

- [Go http.Request.RequestURI](https://pkg.go.dev/net/http#Request.RequestURI)
- [Cloudflare request limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/#request-limits)
