# 0011 - Privacy-friendly product analytics

**Status:** accepted - 2026-08-10

## Context

The MVP needs directional WAU, retention, and solved-task metrics without adding
advertising trackers or collecting student answers and identities. The operator
already owns the production Kubernetes platform, so the analytics data should
remain on that infrastructure.

## Decision

Run a self-hosted Umami instance and load its tracker once from the Next.js root
layout. The integration is disabled unless a secure script URL, a valid website
UUID, and an explicit domain allowlist are all configured.

Tracker configuration:

- respect the browser Do Not Track signal;
- exclude URL query strings and hashes;
- keep automatic anonymous page-view tracking for WAU and retention;
- emit one `task-solved` event for each correct practice, diagnostic, or mock
  answer;
- limit event properties to `source`, exam `position`, and optional
  `helpLevel`.

Do not call Umami `identify`. Custom events must not contain names, email
addresses, application account/session/run/task identifiers, answers, search
queries, or free-form text. Public route paths remain part of anonymous
page-view data. Session replay, advertising pixels, and automatic performance
collection are outside this decision.

No cookie banner is added for this narrowly configured cookie-free measurement.
This decision must be revisited before enabling browser storage, identification,
session replay, or another analytics provider.

Metric definitions:

- **WAU:** anonymous unique visitors over the latest seven complete days;
- **retention:** Umami's anonymous returning-visitor retention report;
- **solved tasks:** count of `task-solved` events, segmented by `source` when
  needed.

These metrics are directional product signals. Browser blocking and Do Not Track
mean they are intentionally not billing-grade totals.

## Consequences

The application has no analytics network dependency in development or when the
configuration is missing or malformed. The Kubernetes deployment must provide
the Umami service, its own database, the public tracker URL, website UUID, and
domain allowlist before issue #12 is complete.

References:

- [Umami tracker configuration](https://docs.umami.is/docs/tracker-configuration)
- [Umami SPA tracking](https://docs.umami.is/docs/guides/track-single-page-apps)
- [Umami event tracking](https://docs.umami.is/docs/track-events)
