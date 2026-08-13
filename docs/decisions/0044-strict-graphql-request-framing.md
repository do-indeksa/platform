# 0044 - Strict GraphQL request framing

**Status:** accepted - 2026-08-13.

**Context.** `/graphql` is the shared product API for learning runs, attempt
journals, preparation preferences, and training drafts. The pinned gqlgen POST
transport reads a request body and decodes its first JSON value without checking
for EOF. A valid preferences mutation followed by a second JSON document was
therefore executed and persisted instead of being rejected as malformed HTTP
input. Decoder type errors could also include the original request body in the
transport error message.

**Decision.** A preflight handler validates every GraphQL POST before gqlgen can
parse or execute an operation. The request must use `application/json`;
parameters such as `charset=utf-8` remain valid. A known content length above
256 KiB is rejected before reading, while `MaxBytesReader` enforces the same
limit for absent or incorrect lengths. The inbound body is closed after one
bounded read.

The body must contain exactly one non-null JSON object followed only by JSON
whitespace and EOF. Known GraphQL envelope fields retain their protocol types:
`query` and `operationName` are strings or null, while `variables` and
`extensions` are objects or null. Unknown top-level fields remain allowed for
forward-compatible extensions. The validated bytes are then exposed to gqlgen
as a fresh reader; schema validation, operation selection, authentication,
complexity, and resolver behavior remain gqlgen and product concerns.

Framing failures use the GraphQL `errors` envelope without reflecting request
bytes or read errors. Invalid bodies return HTTP 400 and `BAD_REQUEST`, bodies
over 256 KiB return HTTP 413 and `PAYLOAD_TOO_LARGE`, and unsupported media
types return HTTP 415 and `UNSUPPORTED_MEDIA_TYPE`. `OPTIONS` advertises only
the configured `OPTIONS, POST` methods.

**Consequences.** No resolver or database write can run for rejected transport
input. Existing browser clients remain compatible because they send one JSON
object with `application/json`, including `variables: null` for operations with
no variables. GraphQL execution errors keep their existing codes and status
semantics; transport failures are now deterministic before execution.
