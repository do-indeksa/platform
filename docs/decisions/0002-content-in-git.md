# 0002 — Educational content lives in git, not in the database

**Status:** accepted · 2026-07-11

**Context.** Tasks and solutions need review (math correctness), versioning, and public transparency. An admin-panel + DB approach hides content history and bypasses review.

**Decision.** Tasks/solutions/guide data are Markdown + YAML frontmatter files in `content/`, changed only via reviewed PRs. The database stores user data only (accounts, progress, attempts). The frontend reads content at build time.

**Consequences.** Content errors are revertable with git; the content maintainer reviews diffs as plain text; contribution history is public. Content deploys require a rebuild — acceptable at this scale.
