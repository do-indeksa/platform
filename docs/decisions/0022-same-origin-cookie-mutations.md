# 0022 - Same-origin cookie mutations

**Status:** accepted - 2026-08-12

**Context.** The API authenticates browsers with an `HttpOnly` host-only
`SameSite=Lax` cookie. GraphQL mutations, the legacy attempt endpoint, and
logout change account state. Cookie attributes reduce cross-site request risk,
but they are not the complete authorization boundary. Local development and
preview traffic also reaches the API through Next.js rewrites, while production
routes API paths directly from Cloudflare Tunnel.

**Decision.** A router-level middleware rejects every unsafe request carrying a
session cookie unless its browser source is the exact externally visible
request origin and that origin is configured as allowed. `Origin` is primary,
with the origin portion of `Referer` as a compatibility fallback.
`Sec-Fetch-Site: cross-site` is rejected before origin comparison. Missing,
opaque, malformed, foreign, and same-site sibling origins fail closed.

Safe methods and requests without a session cookie keep their existing
behavior, including OAuth callback and one-time handoff flows. Next.js forwards
the public origin through `X-Di-Forwarded-Origin` for `/graphql` and
`/api/v1/*`; direct production routing uses the canonical forwarded host and
scheme. The policy follows the OWASP origin-verification and Fetch Metadata
defense-in-depth guidance documented in the
[CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

**Consequences.** Browser mutations with a session require origin-bearing
requests. Non-browser clients replaying a session cookie must supply the exact
allowed origin. GraphQL, REST compatibility, and logout share one enforcement
point, and proxy behavior has a dedicated integration test. Production rollout
must verify same-origin success and cross-origin rejection at the Cloudflare
edge before promotion.
