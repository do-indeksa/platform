# 0026 - Bounded OAuth upstream calls

**Status:** accepted - 2026-08-12; extends
[0025](0025-structured-oauth-origins.md).

**Context.** Google token exchange and userinfo retrieval previously used the
default HTTP behavior without a service-owned deadline. Userinfo JSON was decoded
directly from an unbounded response body. Some errors from the OAuth library can
contain provider bodies, URLs, or response details, so passing those errors to
application logging could disclose authorization codes, PKCE verifiers, access
tokens, or provider diagnostics.

**Decision.** One ten-second context deadline covers token exchange and userinfo
retrieval together. Both calls use the same HTTP client with an eleven-second
defensive timeout, inherit request cancellation, close response bodies, and
reject redirects. The userinfo body is limited to 64 KiB before decoding and
must contain exactly one JSON value; unknown claims and trailing whitespace
remain forward-compatible.

Only an OAuth `invalid_grant` response with status 400 is classified as a
rejected authorization code. Other network, timeout, token, userinfo status,
size, or JSON failures become a fixed provider-unavailable error. The callback
returns `502 oauth_provider_unavailable`, and logs include only a fixed operation
stage rather than raw upstream errors.

**Consequences.** A slow or malformed provider cannot occupy a callback
indefinitely or force unbounded userinfo allocation. Provider troubleshooting
uses stable operation stages instead of response payloads. An external request
timeout shorter than ten seconds still wins, while database persistence keeps
the original callback context and is not tied to the completed upstream timer.
