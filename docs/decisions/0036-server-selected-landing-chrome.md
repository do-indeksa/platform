# 0036 - Server-selected landing chrome

**Status:** accepted - 2026-08-16

**Context.** The public landing page uses the Marketing Header for guests and
the inset App Header for signed-in users. Client-only session bootstrap rendered
the guest header first for every request, then replaced it after `/v1/me`
resolved. Authenticated visitors therefore saw the wrong navigation and a
layout shift. A transient auth or network failure also replaced the entire
application tree with an error page, hiding navigation and risking unsafe owner
transitions if children were simply left mounted as a guest.

**Decision.** The landing server component chooses its initial header from the
presence of either supported session-cookie name. Cookie presence is only a
rendering hint: it is never parsed, exposed, or treated as authentication. The
client still resolves the user through `/v1/me` and reconciles a stale hint.
Because the response varies by cookie, the landing route is dynamic and must be
served with private, no-store caching.

`UserProvider` keeps the application tree mounted when bootstrap fails and
continues to expose identity as loading rather than guest. Owner-scoped stores
therefore remain untouched. A fixed recoverable alert reports the failure and
retries bootstrap without shifting or replacing the current shell. Immersive
routes receive the same recovery action even though they intentionally omit
global navigation.

**Consequences.** Valid guest and signed-in sessions receive the correct Figma
header in the first rendered response. Invalid or expired cookie hints may
reconcile once after the authoritative request, but they cannot grant access or
change local ownership. Landing requests lose static shared caching in exchange
for deterministic auth-aware chrome; content remains server-rendered and the
API stays directly exposed rather than proxied through Next.js.
