# 0046 - Single-command GraphQL mutations

**Status:** accepted - 2026-08-14.

**Context.** gqlgen executes top-level mutation fields serially, but Do indeksa
resolvers commit their own domain transactions. A selected operation with two
aliased commands could therefore commit the first resolver and fail the second.
The resulting GraphQL error did not communicate that product state had already
changed, so a retry could conflict with or duplicate the partial outcome.

Current browser clients send one top-level mutation field per request. Composite
reads remain useful, while no product workflow relies on batching independent
commands into one mutation operation.

**Decision.** A GraphQL mutation may select at most one effective top-level
field. An operation-context extension enforces this after parsing, validation,
operation selection, and variable coercion but before any resolver executes.
It resolves aliases, named and inline fragments, and `@skip`/`@include`
directives for the current variables. Zero effective fields and one command are
valid; two or more return HTTP 422 with `GRAPHQL_VALIDATION_FAILED`.

Queries retain multiple top-level fields. A single mutation field may still
represent a purpose-built aggregate command whose domain service commits one
transaction. Independent commands must use independent requests and their
existing idempotency or optimistic-concurrency contracts.

**Consequences.** One GraphQL response now describes at most one committed
product command. A failed command cannot hide an earlier sibling commit, and
aliases or conditional fragments cannot bypass the boundary. This is an
intentional restriction of the product API rather than a claim that GraphQL
requires mutation operations to be atomic.
