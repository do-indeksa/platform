# 0068 - Sanitize net/http server errors

**Status:** accepted - 2026-08-14

## Context

The API routes access, recovery, and operational events through allowlisted JSON
records. Its `http.Server.ErrorLog` remained nil, so `net/http` used the
package-global standard logger for errors accepting connections, unexpected
handler behavior, and underlying filesystem failures.

That logger receives a preformatted string rather than the original error. The
application therefore cannot safely classify it or prove which remote address,
connection metadata, handler detail, or future standard-library text it may
contain. Parsing known message prefixes or partially redacting the string would
make the safety boundary depend on undocumented wording.

## Decision

The HTTP server constructor requires the application `slog.Logger` and always
sets `http.Server.ErrorLog`. A dedicated standard-log writer discards the entire
preformatted byte slice and emits one fixed JSON event:

- level `ERROR`;
- message `http server error`;
- `error.kind=internal`.

The record has no request ID because accept and protocol failures can happen
before a request reaches application middleware. It also omits the rendered
message, concrete error type, remote endpoint, request metadata, stack, and
every other dynamic field. The writer reports the consumed byte length and a
nil error so replacing the output channel does not change standard-log control
flow.

## Consequences

All process-owned HTTP server records now use the same JSON destination without
creating a second raw-text logging path. A unique-marker regression test asserts
the exact top-level and nested field allowlists.

The event intentionally carries less diagnostic detail. Operators correlate
its count and timestamp with privately governed platform network, listener, and
resource metrics. Richer classification would require instrumentation before
`net/http` renders the error, not parsing this output string.

Request handling, timeout budgets, responses, shutdown, and edge routing remain
unchanged.

References:

- [Go HTTP Server.ErrorLog](https://pkg.go.dev/net/http#Server.ErrorLog)
- [Go standard logger construction](https://pkg.go.dev/log#New)
- [Go structured logging](https://pkg.go.dev/log/slog)
