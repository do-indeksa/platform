# 0024 - Allowlist-only API request logs

**Status:** accepted - 2026-08-12.

**Context.** The default chi request logger writes `RequestURI`, which includes
OAuth callback `code` and `state`, preview handoff codes, and arbitrary query
values. Its recovery middleware also writes the recovered panic value. These
values must not become durable application logs.

**Decision.** The API emits structured access logs from an explicit allowlist:
server-generated request ID, normalized HTTP method, matched chi route template,
response status, response bytes, and duration. Unmatched requests use the
constant `<unmatched>` route. The application never logs a raw URL or path,
query, host, client address, header, cookie, authorization value, or body as
request metadata. Caller-provided request IDs are ignored; the generated UUID
is returned in `X-Request-ID`.

HTTP and GraphQL recovery logs include the server request ID and a stack trace,
but omit the recovered value. Recovery continues to return an internal error and
the access record captures the resulting status.

**Consequences.** Application logs remain useful for route-level status,
latency, volume, and support correlation without retaining OAuth/session
credentials or user-supplied request metadata. Source-address or full-URL
investigations must use explicitly governed edge telemetry rather than silently
expanding the application log schema. Any future field requires a regression
test proving that it cannot carry request-controlled secret material.
