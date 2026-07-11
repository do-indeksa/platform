# 0003 — Rebase-only merges

**Status:** accepted · 2026-07-12

**Context.** Squash merging collapses a branch into one commit — atomic commits disappear from `main` and from the contribution graph. Public commit history is part of the project's transparency story.

**Decision.** Rebase merge only; squash and merge commits disabled repo-wide. Linear history, atomic conventional commits preserved on `main`.

**Consequences.** Branches must be kept clean (no "wip" commits) — history hygiene is enforced at the branch level, not by squashing.
