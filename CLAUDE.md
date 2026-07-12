# Do indeksa — project rules

Free platform for Serbian maturanti: faculty choice ("Izaberi") + entrance exam preparation ("Spremi se"). MVP: FTN P1 mathematics + Novi Sad faculty guide.

## Languages

- Communication with Claude: Russian.
- Code, commits, identifiers, technical docs: English.
- Main docs in English; user-facing docs duplicated in Serbian (latin script): `README.md` + `README.sr.md`.
- Platform content for students (tasks, solutions, guide): Serbian latin script, as on the real exam.

## GitHub

- Fully public development: commits, issues, milestones, roadmap.
- Account: **Dimitrymas**. Organization: **do-indeksa**.
- Roadmap via issues + milestones.

## Git workflow (see CONTRIBUTING.md)

- GitHub Flow: `main` protected, everything via PR (`Closes #N`), branches `type/issue-slug`, branch deleted after merge.
- Conventional Commits, atomic: `feat|fix|content|docs|chore|refactor|test|ci(scope): imperative lowercase`.
- Rebase merge only — squash and merge commits are disabled; atomic commits must reach `main`.
- Content PRs (`content/`): review by Konstantin required. Code PRs: self-merge on green CI.
- Sprint end = tag `v0.X.0` + GitHub Release.

## Stack and architecture (locked 2026-07-11)

- Backend: Go, single monolith (chi + pgx + sqlc) — accounts (Google OAuth), progress, simulation results, metrics. No microservices.
- Frontend: Next.js + KaTeX. Zustand scoped to exam runtime only.
- DB: Postgres (Neon/Supabase free tier). User data only.
- Content lives in git, not in the DB: tasks as Markdown + YAML frontmatter in `content/`, changed via reviewed PRs.
- Deploy: web — Vercel; api — Fly.io/Hetzner VPS.
- Monorepo: `apps/web`, `apps/api`, `content/`, `tools/`. Details: `docs/ENGINEERING.md`, decisions: `docs/decisions/`.

## Code and docs — no noise

- No comments in code. Disable lint rules requiring doc comments on exports (revive `exported`).
- Docs: facts, decisions, instructions only. ADRs ≤ 10 lines.

## Copyright — hard bans

- NEVER commit the OCR'd FTN priručnik (688 tasks, `06_Bonus/Ceo_prirucnik_688_zadataka.pdf`) — FTN copyright, personal reference only.
- Do not commit original FTN/ETF exam PDFs — links to the official site + own metadata (year, topic, difficulty) only.
- Our authored tasks and solutions: published freely.

## Licenses

- Code: MIT. Content (`content/`): CC BY-NC-SA 4.0.

## Source materials (local, outside the repo)

- `~/Documents/FTN/FTN_P1_Materijali/` — task bank, authored variants, thematic sheets; LaTeX sources in `_LaTeX_izvori/`.
- `~/Documents/FTN/Prijem_i_napravljenja/` — guide data: FTN programs 2026, score thresholds, site map.
- P1 format: 10 tasks × 6 points = 60 total, 180 minutes.
