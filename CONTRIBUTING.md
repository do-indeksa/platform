# Contributing

## Workflow: GitHub Flow

- `main` is always deployable. Direct commits and force-pushes to `main` are disabled — all changes go through pull requests.
- Code changes (`feat`, `fix`, `refactor`, `chore`, `ci`) start from an issue and the branch carries its number; `content/` and `docs/` branches may go without.
- Short-lived branches off `main`, named `type/issue-slug`:
  - `feat/14-variant-generator`
  - `fix/23-timer-drift`
  - `content/trigonometrija`
  - `docs/...`, `chore/...`, `ci/...`
- A branch lives days, not weeks. Merged branches are deleted automatically.

## Commits: Conventional Commits

```
feat(web): add task catalog with difficulty filter
fix(api): correct P1 score calculation for skipped tasks
content(trig): add 12 verified tasks for slot 5
```

- Types: `feat`, `fix`, `content`, `docs`, `chore`, `refactor`, `test`, `ci`
- English, imperative mood, lowercase after the colon
- Atomic commits: one logical change per commit

## Pull requests

- Every change goes through a PR. Reference the issue: `Closes #14`.
- Code PRs: self-merge allowed once CI is green.
- **Content PRs (`content/`): the math must be verified before merge** — by a second reviewer when available, otherwise by the maintainer.
- Merge method: **rebase only** (linear history, atomic commits preserved). Squash and merge commits are disabled repo-wide.

## Releases

End of each sprint = tag + GitHub Release with notes (`v0.1.0`, `v0.2.0`, …).

## Attribution

Commits and PRs carry no AI attribution of any kind. All work is authored by project contributors only.
