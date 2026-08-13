# 0047 - Canonical GraphQL request envelope

**Status:** accepted - 2026-08-14; extends
[0044](0044-strict-graphql-request-framing.md) and
[0045](0045-bounded-graphql-documents.md).

**Context.** GraphQL preflight decoded each JSON object into a Go map, while
the pinned gqlgen POST transport decoded the same bytes into a struct. The map
kept only the last value of duplicate member names and matched protocol fields
case-sensitively. Go struct decoding matched JSON names case-insensitively and
also kept the last value. As a result, `Query`, `Variables`, `OperationName`,
and `Extensions` bypassed preflight field checks, while duplicate `query`
members could make the two layers validate different effective envelopes. An
invalid first duplicate also reached a gqlgen error path that reflected the
complete request body.

**Decision.** Preflight reads the bounded top-level JSON object member by
member before gqlgen sees it. Every top-level member name must occur exactly
once. The GraphQL protocol fields use only their canonical spellings:
`query`, `operationName`, `variables`, and `extensions`. A case-insensitive
alias of one of those names is invalid. Their existing nullability and value
types remain unchanged.

Unique unknown top-level fields remain valid for forward-compatible protocol
extensions. Duplicate unknown fields are rejected because JSON does not define
which value an application must select, and forwarding an ambiguous envelope
would reintroduce parser-dependent behavior. Any violation returns sanitized
HTTP 400 `BAD_REQUEST` before document parsing, cache insertion, authentication
inside a resolver, or a database write.

**Consequences.** The document byte boundary is applied to the same canonical
`query` value that gqlgen executes. Rejected envelopes cannot enter gqlgen's
body-reflecting decode-error path. Standards-compliant first-party clients are
unchanged; clients relying on duplicate member names or non-canonical protocol
field casing must emit one canonical member instead.
