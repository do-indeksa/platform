# 0060 - Allowlist-only API request logs

**Status:** accepted - 2026-08-14

## Context

The default chi request logger records the request URI, host, and remote address.
The URI includes OAuth callback `code` and `state`, preview handoff codes, and
arbitrary query values. Chi's default request ID middleware also trusts an
inbound header, while its recovery hook receives the recovered panic value.
Those request-controlled values must not become durable application logs.

## Decision

The API installs a JSON `slog` handler and injects its logger into the router.
It does not mutate chi's package-global default logger. A request middleware
generates a fresh UUID, puts it in the request context and `X-Request-ID`
response header, and ignores any caller-provided request ID.

Access records contain only the server request ID, a fixed-set normalized HTTP
method, the matched chi route template, response status, response byte count,
and duration in milliseconds. Unknown methods become `OTHER`; requests without
a matched route use `<unmatched>`. Raw URLs, paths, queries, hosts, client
addresses, headers, cookies, authorization values, and request or response
bodies are not access-log fields.

HTTP and GraphQL recovery records contain the server request ID and stack trace
but omit the recovered value. Other operational error logs remain independent
call sites and may only receive errors whose contracts exclude credentials and
request payloads.

## Consequences

Application logs retain route-level status, latency, volume, and support
correlation without retaining OAuth or session credentials as request metadata.
Source-address or full-URL investigations require explicitly governed edge
telemetry instead of an expanded application schema.

Regression tests inject unique markers through callback and GraphQL queries,
bodies, route parameters, host and client metadata, headers, cookies, caller
request IDs, and panic values. They require every marker to remain absent and
assert the exact field set of access and recovery records. Any future log field
must extend that negative test before it can enter the schema.

References:

- [chi middleware package](https://pkg.go.dev/github.com/go-chi/chi/v5/middleware)
- [Go structured logging](https://pkg.go.dev/log/slog)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
