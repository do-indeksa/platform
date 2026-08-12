# 0021 - Owner-scoped Study Plan preferences

**Status:** accepted - 2026-08-12

**Context.** Study Plan stores the student's target score and exam date in
`localStorage`. The original Zustand key was global to the browser and carried
no owner. After an account switch, the next student could therefore receive the
previous student's goal, schedule, and derived practice recommendation.

**Decision.** Every saved Study Plan preference key includes either a validated
user UUID or the explicit `guest` scope. Authentication and preference
hydration must finish before the plan renders personalized facts or allows its
settings dialog to open. An owner transition returns the route synchronously to
the existing neutral loading composition, then hydrates only the new scope.

The storage key moves to `v2`. The unscoped legacy value is ignored because its
owner cannot be proved. Guest and account preferences remain independent;
automatic claim or cross-device synchronization requires a separate product
and backend contract.

**Consequences.** Account A, account B, and guest can safely keep different
device-local goals in one browser. Existing unscoped preferences are lost once
during migration. The canonical Figma ready state and its geometry do not
change.
