# 0066 - Allowlist API request and recovery logs

**Status:** accepted - 2026-08-17

## Context

The API used Chi's default request ID, logger, and recoverer middleware. Its
logger renders the raw request URI, host, and remote address. The request ID
middleware also trusts an inbound `X-Request-ID`. OAuth callback parameters,
GraphQL query parameters, route values, unmatched paths, and a caller-selected
correlation value could therefore enter durable logs.

HTTP and GraphQL recovery paths also rendered the recovered panic value. A
panic value is arbitrary application or dependency data and is not a safe log
contract. The process logger was not explicitly configured as JSON, making the
record shape dependent on the standard library default.

## Decision

The process installs one JSON `slog` logger on stdout. The router receives that
logger explicitly for request records.

Every request entering the application router gets a new UUID request ID. The
application ignores inbound request ID headers, stores its generated value in
the existing Chi request context slot, and returns it in `X-Request-ID`. Current
HTTP and GraphQL consumers can therefore correlate records without trusting a
caller-selected value.

The access record contains only:

- `request_id`;
- an allowlisted HTTP `method`, or `OTHER`;
- the matched static `route` template, or `<unmatched>`;
- numeric `status` and response `bytes`;
- integer `duration_ms`.

The JSON handler adds only its standard time, level, and message fields. The
record excludes the URL, concrete path, query string, protocol, host, remote
address, headers, request and response bodies, route values, and arbitrary
middleware data.

HTTP and GraphQL recovery records contain a fixed message, the server-owned
request ID, and a runtime stack. They ignore the recovered value. Request ID,
access logging, and recovery remain the first three router middleware in that
order so a recovered response is correlated and recorded with its final status.

This decision does not classify arbitrary operational errors; that is #333. It
also does not own pre-request `net/http` server errors; that is #335.

## Consequences

Request and recovery records are stable JSON suitable for alerting by route and
status without retaining credentials or request content. A caller cannot forge
the correlation value returned by the application.

The API intentionally gives up concrete URL, client-address, and arbitrary
panic diagnostics. Investigation uses the generated request ID, route template,
status, timing, stack, dependency health, and separately governed metrics. A
runtime stack reveals code paths but not local values or the recovered value.

Parser or listener failures that happen before the router do not receive an
application request ID or access record. Adding distributed tracing, another
log field, or inbound correlation requires a separately reviewed trust and
allowlist contract.

References:

- [Go structured logging](https://pkg.go.dev/log/slog)
- [Chi request logging](https://pkg.go.dev/github.com/go-chi/chi/v5/middleware#RequestLogger)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
