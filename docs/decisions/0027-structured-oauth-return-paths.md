# 0027 - Structured OAuth return paths

**Status:** accepted - 2026-08-12; extends
[0026](0026-bounded-oauth-upstream.md).

**Context.** The OAuth start endpoint previously accepted any return value that
started with one slash but not two. A value such as `/\evil.example` passed that
test and was emitted unchanged in a `Location` header. Browsers parse a
backslash as a path separator for HTTPS URLs and resolve that value to the
foreign `https://evil.example/` origin. A signed state value or stored preview
handoff created by older code also remained trusted after its initial check.

**Decision.** Return values are parsed into a bounded absolute-path reference
with no scheme, authority, credentials, or opaque form. Literal or
percent-decoded backslashes, Unicode controls or spaces, invalid UTF-8, encoded
path separators, malformed escapes, ambiguous leading separators, and raw or
canonical values over 2 KiB are rejected. Accepted paths have dot segments
removed and a canonical encoded representation while retaining valid query and
fragment semantics.

Invalid request input falls back to `/` before OAuth state is sealed. A callback
revalidates and canonicalizes the sealed return path before cancellation or code
exchange. Preview handoff creation and consumption validate independently, and
an invalid stored handoff is consumed without issuing a session.

**Consequences.** Existing app paths, locale prefixes, query strings, fragments,
and preview handoffs keep working. Ambiguous browser references fail closed even
when they were signed or stored by an older build. The parser intentionally uses
a narrower contract than generic URI parsing because the final security
boundary is WHATWG browser URL resolution:
[URL Standard](https://url.spec.whatwg.org/),
[RFC 3986 relative references](https://www.rfc-editor.org/rfc/rfc3986.html#section-4.2).
