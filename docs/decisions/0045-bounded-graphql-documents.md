# 0045 - Bounded GraphQL documents

**Status:** accepted - 2026-08-14.

**Execution-budget update.** ADR 0074 supersedes this record's 2,000-unit
selected-operation ceiling. The document, parser-token, and query-cache bounds
defined here remain current.

**Context.** The shared `/graphql` endpoint already limits the complete JSON
envelope to 256 KiB and rejects selected operations above complexity 2,000.
Those controls do not bound document parsing. In the pinned gqlgen runtime, a
document is parsed and validated, then added to the 1,000-entry query cache
before the selected operation's complexity is evaluated. A request below the
envelope limit could therefore contain a cheap selected operation plus thousands
of unselected operations and still retain a large unique cache key and AST.

**Decision.** GraphQL POST preflight limits the decoded `query` string to 16 KiB
before gqlgen parsing, validation, cache insertion, or resolver execution. A
document over that byte boundary returns HTTP 422 with
`GRAPHQL_PARSE_FAILED`. The gqlgen parser independently accepts at most 4,096
tokens, which bounds compact documents that fit below 16 KiB. Its existing
protocol error preserves the same HTTP status and code.

The limits are intentionally independent:

- 256 KiB bounds the complete JSON envelope, including variables and extensions;
- 16 KiB bounds the document text and each query-cache key;
- 4,096 tokens bounds parser work for compact documents;
- selected-operation complexity bounds execution (33,500 under ADR 0074);
- 1,000 entries bound the number of parsed documents retained in the LRU.

The byte boundary is inclusive. `query: null`, `variables: null`, unknown
top-level envelope fields, and the existing 256-KiB request boundary retain the
compatibility defined by ADR 0044. Current first-party documents are below 1
KiB, leaving substantial room for future product operations without exposing
the parser and cache to the full envelope allowance.

**Consequences.** Oversized or token-dense documents cannot reach operation
selection or mutate product state. Large legitimate variable payloads retain
the existing request allowance. Future schema growth must keep first-party
documents within both document limits or deliberately revise this decision with
measurements and boundary tests; increasing only the HTTP body limit is not a
substitute.
