# 0054 - Own the web security headers in the application

**Status:** accepted - 2026-08-14

## Context

The standalone Next.js server exposed `X-Powered-By: Next.js` and did not emit
an application-owned CSP, framing policy, referrer policy, permissions policy,
or HSTS contract. Production will add Cloudflare in front of the application,
but preview, local production, and edge behavior must not depend on an
undeployed dashboard rule or drift between environments.

The web build currently prerenders 279 pages. Next.js nonce-based CSP requires
dynamic rendering for every protected page, disables static optimization and
CDN caching, and increases server work per request. The optional self-hosted
Umami URL is also selected at runtime so the same immutable image can move
between environments.

## Decision

Next.js owns one tested response-header set for every web path and disables its
framework disclosure header. Production responses include:

- a CSP that limits the default, form, frame, object, worker, media, manifest,
  font, image, connection, script, and style boundaries;
- `frame-ancestors 'none'` plus `X-Frame-Options: DENY`;
- `script-src-attr 'none'` so inline event handlers stay disabled;
- HSTS for one year, MIME sniffing protection, a strict-origin referrer policy,
  a least-privilege permissions policy, and cross-origin isolation hints.

The production script and connection policies permit HTTPS because the
validated Umami tracker origin is runtime configuration. `unsafe-eval` and
insecure network schemes remain disabled. Development adds `unsafe-eval`, HTTP,
and WebSocket transports required by React diagnostics, local analytics, and
hot reload, and omits HSTS and mixed-content upgrades.

The CSP retains `unsafe-inline` for scripts and styles. This is a deliberate
static-rendering compatibility boundary, not a claim of strict nonce-based XSS
isolation. Raw task HTML remains disabled in the Markdown pipeline, inline
event handlers stay blocked, and CSP remains defense in depth rather than an
input sanitizer. A future move to per-request nonces must first account for the
loss of static generation; stable Turbopack-compatible SRI would be another
route to evaluate when it is no longer experimental.

## Consequences

Local production, previews, and the Cloudflare deployment share the same
minimum browser policy. Edge configuration may strengthen these headers but
must not remove or broaden them. The current static route classification and
runtime analytics configuration remain intact. Browser tests verify
representative HTML and route-handler responses, while unit tests keep
development-only CSP sources out of production.

References:

- [Next.js Content Security Policy guide](https://nextjs.org/docs/app/guides/content-security-policy)
- [Next.js custom headers reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [Next.js `poweredByHeader` reference](https://nextjs.org/docs/app/api-reference/config/next-config-js/poweredByHeader)
