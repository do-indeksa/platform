# 0056 - Own the API security headers in the application

**Status:** accepted - 2026-08-14

## Context

Production sends `/graphql` and `/api/v1/*` from the Cloudflare Tunnel directly
to the Go service. These responses therefore bypass the Next.js policy from
[0055](0055-application-owned-web-security-headers.md). The router already
disabled caching but did not define a browser security boundary, so one public
origin behaved differently according to which internal service handled a path.

API responses are JSON, redirects, empty success responses, or plain-text health
checks rather than active HTML documents. They still need MIME-sniffing and
referrer controls, and a deny-by-default policy limits the impact if an error or
JSON response is ever interpreted as a document. `frame-ancestors` must be
explicit because it does not inherit from `default-src`.

## Decision

The Go router applies one middleware to every response, including health, 404,
OAuth, REST, and GraphQL paths. It sets:

- `Content-Security-Policy: default-src 'none'; base-uri 'none'; form-action
'none'; frame-ancestors 'none';`;
- `Cross-Origin-Resource-Policy: same-origin`;
- a denylist `Permissions-Policy` for unused browser capabilities;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
  `X-Permitted-Cross-Domain-Policies: none`.

When the already validated canonical origin uses HTTPS, the middleware also
sets one-year HSTS. Explicit local HTTP origins omit HSTS. The policy does not
add COOP: the API has no browsing context to isolate, and OAuth redirects should
not acquire HTML-page popup semantics. Next.js remains the owner of COOP for
rendered documents.

The middleware runs after no-cache headers and before origin/authentication
logic. It does not replace request-origin authorization, cookie policy, CORS,
content-type validation, or Cloudflare edge controls. The edge may strengthen
the policy but must not remove or broaden it.

## Consequences

The browser policy now covers both services behind the public origin without a
Next.js API proxy. Health and 404 responses provide a cheap router-level proof
that the middleware is global, while focused unit tests own the exact values and
the HTTPS-versus-local HSTS behavior. Response status codes, bodies, caching,
OAuth redirects, and GraphQL transport remain unchanged.

References:

- [OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html)
- [MDN `frame-ancestors` reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors)
