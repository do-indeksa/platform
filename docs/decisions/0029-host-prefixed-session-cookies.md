# 0029 - Use host-prefixed session cookies on HTTPS

**Context.** A host-only cookie without a reserved prefix can share its name
with a parent-domain cookie injected by a compromised sibling subdomain. Cookie
ordering then becomes ambiguous at the server and can cause cookie tossing,
forced logout, or session fixation behavior.

**Decision.** Validated HTTPS configurations issue, read, refresh, authorize,
and delete only `__Host-di_session`. The cookie is `Secure`, `HttpOnly`,
`SameSite=Lax`, has `Path=/`, and has no `Domain` attribute. Explicit HTTP
loopback development keeps `di_session`, because browsers reject a `__Host-`
cookie without `Secure`.

There is no fallback from the HTTPS name to the legacy name. The first future
deployment of this pre-production service will therefore invalidate existing
browser sessions instead of preserving an ambiguous cookie boundary.

**Consequences.** A sibling subdomain cannot mint the cookie name accepted by
the production API. Authentication, mutation-origin checks, refresh, and logout
all select the same configuration-derived name. Local HTTP development remains
usable, while HTTPS tests must use the host-prefixed name explicitly.
