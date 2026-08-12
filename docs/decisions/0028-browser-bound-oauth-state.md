# 0028 - Browser-bound OAuth state
**Status:** accepted - 2026-08-13; extends [0027](0027-structured-oauth-return-paths.md).
**Context.** Encrypted OAuth state and preview handoff codes were bearer values, so a copied callback URL could sign another browser into the initiator's account.
**Decision.** Every transaction gets a random host-only `HttpOnly`, `SameSite=Lax` cookie; sealed state and Postgres store only its SHA-256 digest and random identifier. Versioned state encryption and handoff hashing prevent old and new pods from consuming each other's transactions during rollout.
Canonical callbacks validate the canonical cookie before cancellation, provider exchange, session issue, or redirect. Preview starts bounce through both origins so canonical callback and preview handoff each prove their own host cookie.
Binding cookies are transaction-specific, support parallel tabs, expire within the OAuth window, and are cleared on callback, successful exchange, or cancellation at their own origin. Missing, malformed, mismatched, expired, or moved bindings fail with stable errors without consuming a valid handoff.
New binding columns stay nullable so old pods can drain safely; new queries require all binding values, while legacy rows expire under their original 30-second contract.
**Consequences.** OAuth state, PKCE verifier, and preview handoff URLs are no longer sufficient to move an authorization between browsers; canonical production routing and preview-only Next.js rewrites remain unchanged.
