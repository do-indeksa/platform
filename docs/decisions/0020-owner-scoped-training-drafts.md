# 0020 - Owner-scoped Training Builder drafts

**Status:** accepted - 2026-08-12

**Context.** Training Builder stores a manually saved practice composition in
`localStorage`. The original key was global to the browser. After an account
switch, a second student could therefore restore the previous student's task
counts and settings, including a composition derived from recent mistakes.

**Decision.** Every saved Training Builder draft key includes either a
validated user UUID or the explicit `guest` scope. Authentication must resolve
before the builder reads, renders, or writes persisted draft state. An owner
transition synchronously renders the neutral default composition and disables
mutating controls until only the new scope has hydrated.

The storage version moves to `v2`. The unscoped legacy value is ignored because
the client cannot prove which account created it. Guest and account drafts stay
independent; automatic claim or cross-device synchronization would require a
separate product and backend contract.

**Consequences.** Account A, account B, and guest can safely keep different
device-local compositions in one browser. Existing unscoped drafts are lost
once during migration. This changes persistence ownership only; the canonical
Figma layout and visible ready state remain unchanged.
