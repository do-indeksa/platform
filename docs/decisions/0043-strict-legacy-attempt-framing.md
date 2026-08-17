# 0043 - Strict legacy attempt request framing

**Status:** accepted - 2026-08-13.

**Context.** The REST attempt journal remains only to drain bounded legacy
browser queues into signed-in accounts. Its write handler decoded one JSON value
and immediately persisted it. A valid attempt array followed by a second JSON
document was therefore accepted, while an oversized request was reported as the
same generic bad body as malformed JSON. The endpoint also accepted bodies
without the `application/json` media type declared by OpenAPI.

**Decision.** `POST /v1/attempts` and its `/api` alias authenticate first, then
require an `application/json` media type. Parameters such as `charset=utf-8` are
allowed. A known content length above 256 KiB is rejected before reading, and a
streaming `MaxBytesReader` enforces the same limit when length is absent or
incorrect. The bounded read completes before JSON decoding so a streamed size
violation remains `request_too_large` even when the payload is also malformed.

The decoder must read exactly one non-null top-level attempt array followed only
by JSON whitespace and EOF. Empty arrays retain the existing `invalid_batch`
classification; empty, null, malformed, and multiple-document bodies return
`invalid_body`. Unknown attempt object fields remain tolerated so an old queue
can drain after a newer producer added optional data. All framing failures occur
before the service receives a batch, so they cannot write partial rows.

Wrong media types return JSON `415 unsupported_media_type`. Declared and
streamed size violations return JSON `413 request_too_large`. OpenAPI declares
both responses; existing field validation, batch bounds, successful `204`, and
owner scoping remain unchanged.

**Consequences.** The current browser drainer is compatible because it sends one
JSON array with the declared media type. Clients receive precise retry policy:
malformed and unsupported payloads are permanent failures, while server and
network errors remain retryable. New product writes continue to use the
GraphQL run and attempt contracts rather than expanding this legacy endpoint.
