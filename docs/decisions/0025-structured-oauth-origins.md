# 0025 - Structured OAuth origin authorization

**Status:** accepted - 2026-08-12; extends
[0022](0022-same-origin-cookie-mutations.md).

**Context.** OAuth start and preview handoff authorization compared raw origin
strings. A foreign URL whose path, query, fragment, userinfo, or non-default port
ended with the preview suffix could pass that check. The callback then trusted
the sealed value without checking the current allowlist and could redirect a
one-time handoff code to the foreign URL.

**Decision.** All request origins are parsed as scheme, hostname, and port and
serialized to one canonical origin before comparison or storage in OAuth state.
Paths, queries, fragments, userinfo, malformed hostnames, invalid ports, and
non-loopback HTTP are rejected. Explicit runtime origins must already use that
canonical representation, and duplicate entries fail startup.

Preview matching applies only to an HTTPS hostname on the default port. The
configured suffix must begin with `-` and include provider domain labels, for
example `-scope.vercel.app`; a provider-wide wildcard such as `.vercel.app` is
not accepted. The callback revalidates the sealed origin before cancellation,
Google code exchange, handoff minting, or redirect. Origin configuration is
validated before the process contacts Postgres.

**Consequences.** Canonical, explicit extra, and scoped preview origins retain
the existing OAuth flow, including local loopback development. Previously
issued state that is malformed or no longer allowed fails closed. Adding a new
preview provider requires an explicit scoped hostname contract rather than a
raw suffix copied from an arbitrary URL.

This follows the OWASP recommendation to validate redirect destinations against
an allowlist rather than trusting attacker-controlled URL text:
[Unvalidated Redirects and Forwards Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html).
