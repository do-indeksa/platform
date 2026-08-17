# 0068 - Sanitize net/http server errors

**Status:** accepted - 2026-08-17

## Context

Go's `http.Server` sends protocol, connection, and listener failures to its
`ErrorLog`. When that field is nil, the server falls back to the package-global
standard logger. The standard library formats a complete message before the
application receives it, and that text may include a remote address or other
connection and request details outside the API logging allowlist.

Parsing or partially redacting that message would couple the security boundary
to undocumented text produced by the current Go version. A new message shape
could disclose data without changing application code.

## Decision

Every API `http.Server` has an explicit `ErrorLog` backed by the process JSON
logger. Its writer treats the complete standard-library message as untrusted,
does not render or inspect it, and emits exactly one fixed record:

- level `ERROR`;
- message `http server error`;
- `error.kind=internal`.

The record contains no request ID, original message, concrete error type,
remote address, request metadata, or stack. Server errors can occur before the
application router creates a request ID, so inventing one here would not provide
valid request correlation.

The writer reports the complete input byte count and a nil error to preserve the
`log.Logger` writer contract. Existing parser limits, handler execution budget,
socket timeouts, recovery behavior, and graceful shutdown are unchanged.

## Consequences

HTTP server failures remain visible as bounded structured events and can be
counted for alerting without retaining caller-controlled or transport-derived
text. Investigation uses event volume, health checks, edge and platform metrics,
and separately governed infrastructure telemetry.

The application intentionally gives up message-level diagnostics at this
boundary. Adding another field requires a reviewed allowlist change and a
negative test with a unique canary. Preformatted standard-library or dependency
messages must be discarded rather than parsed or redacted.

References:

- [ADR 0066](0066-allowlisted-api-request-logs.md)
- [ADR 0067](0067-classify-operational-errors-before-logging.md)
- [Go http.Server](https://pkg.go.dev/net/http#Server)
- [Go log.Logger](https://pkg.go.dev/log#Logger)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
