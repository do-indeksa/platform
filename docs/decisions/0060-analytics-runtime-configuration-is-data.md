# 0060 - Analytics runtime configuration is data

**Status:** accepted - 2026-08-17

## Context

The analytics bootstrap needs runtime values for the self-hosted tracker URL,
website UUID, and domain allowlist. Serializing those values with
`JSON.stringify` and interpolating them into a JavaScript response still makes
configuration part of executable source. It also couples disabled analytics to
an empty script response instead of an explicit data contract.

## Decision

Serve one fixed bootstrap from `/analytics/bootstrap.js`. The bootstrap fetches
`/analytics/config.json`, which returns the validated tracker configuration as
JSON or `204 No Content` when any required value is missing or malformed.

The browser validates the response status, MIME type, object shape, website
UUID, tracker URL, and non-empty domain allowlist before creating the Umami
script element. It checks for the tracker both before fetching and before
installation so concurrent bootstrap executions still append one script.

Both endpoints are dynamic, `no-store`, and `nosniff`. The bootstrap keeps the
existing tracker ID, deferred loading, domain allowlist, Do Not Track behavior,
query/hash exclusion, and silent fail-closed behavior. No provider, CSP,
identifier, deployment secret, or user-visible behavior changes.

## Consequences

Runtime values never participate in JavaScript source construction. Enabling
analytics adds one same-origin JSON request before the existing tracker request.
Missing configuration, an invalid response, a network error, or malformed JSON
leaves analytics disabled without affecting the application.
