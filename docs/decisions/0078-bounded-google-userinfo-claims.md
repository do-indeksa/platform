# 0078 - Bounded Google userinfo claims

**Status:** accepted - 2026-08-14; extends
[0026](0026-bounded-oauth-upstream.md).

**Context.** Bounded transport and strict JSON framing did not establish an
application contract for the decoded claims. Non-empty `sub` and `email` values
were written directly to unconstrained `text` columns. A blank name then failed
the web bootstrap contract, an escaped NUL reached PostgreSQL as SQLSTATE
`22021`, and an arbitrary picture URL could reach a Next Image configuration
that only permits Google-hosted images.

Google documents `sub` as a case-sensitive ASCII identifier no longer than 255
characters and warns that email is mutable and must not identify an account.
The service already keys users only by `sub`; this decision keeps that model.

**Decision.** Raw userinfo bytes must be valid UTF-8 before JSON decoding. A
required `sub` is one to 255 bytes of printable ASCII. A required email is a
trimmed, control-free address no longer than 320 bytes. Invalid required claims
return the stable incomplete-profile error before any database acquisition.

Names are presentation data. Surrounding whitespace is removed, and a blank,
controlled, or longer-than-256-character name falls back to the validated email.
Pictures are optional and are retained only when they are bounded HTTPS URLs on
a subdomain of `googleusercontent.com`, with no credentials, explicit port, or
fragment. An unusable picture is omitted rather than failing sign-in.

PostgreSQL check constraints enforce the persisted size invariants, and the
`/v1/me` OpenAPI schema declares matching bounds. The migration validates
existing rows and fails instead of truncating identity data.

**Consequences.** Malformed provider data cannot become a callback database
error or a current-user response that the web application cannot render. Valid
Unicode display names and normal Google avatars remain unchanged. Optional
presentation defects degrade to deterministic fallbacks; required identity
defects fail closed. Future identity providers need their own ingestion policy
rather than weakening this Google-specific boundary.

**Reference.** [Google OpenID Connect API reference](https://developers.google.com/identity/openid-connect/reference).
