# Do indeksa

**Free platform helping Serbian maturanti (final-year high-school students) choose a faculty and prepare for university entrance exams.**

[![web CI](https://github.com/do-indeksa/platform/actions/workflows/web.yml/badge.svg)](https://github.com/do-indeksa/platform/actions/workflows/web.yml)
[![container CI](https://github.com/do-indeksa/platform/actions/workflows/images.yml/badge.svg)](https://github.com/do-indeksa/platform/actions/workflows/images.yml)

> Srpska verzija: [README.sr.md](README.sr.md)

## Mission

Equal chances for admission — regardless of city or income. Quality preparation currently costs 20–30 € per private lesson, and the free alternatives are outdated collections and scattered PDFs. Do indeksa is the free, modern alternative.

## Current MVP

- Unified FTN P1 task bank with search, filters, selected practice, exact answer checking, two-level hints, worked solutions, and prefilled task-specific content reports.
- Owner-scoped resumable diagnostic, deterministic prep plan, task of the day and streak, and a four-hour blueprint-based mock exam with cross-device recovery and explicit rubric self-check for partial credit.
- Account-synced history with shareable task filters, reconstructable grading provenance, and an honest complete-mock score trend.
- Current FTN entrance-exam catalog covering 29 programs and the official P1/P3-P8 groups; there is no fictional P2 or physics exam.
- 30 independently authored tasks across all ten P1 areas. The first seven complete topic packs (21 tasks) have versioned mathematical verification records; the remaining 9 stay explicitly in review.
- Responsive `sr-Latn`, English, and Russian interface. Canonical educational content remains Serbian Latin, matching the exam.
- Go API with Google OAuth, secure cookie sessions, Postgres migrations, and a gqlgen run/attempt lifecycle.

Production release preparation is in progress for
[doindeksa.rs](https://doindeksa.rs). The private Kubernetes origin will be
published only through Cloudflare Tunnel and still requires freshly issued
Google OAuth credentials; analytics remains disabled fail-closed until a
vulnerability-clean self-hosted image is available.
See the [production deployment contract](docs/DEPLOYMENT.md) for the enforced
edge, origin-isolation, verification, and rollback boundaries.

## Two pillars

| Pillar                  | What it does                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| **Izaberi** (Choose)    | Faculty guide: programs explained in plain language, scoring and quotas, student experiences |
| **Spremi se** (Prepare) | Task database with detailed solutions, topic progress, and four-hour FTN P1 simulations      |

## Roadmap

| When           | Milestone      | Scope                                                                  |
| -------------- | -------------- | ---------------------------------------------------------------------- |
| Autumn 2026    | **MVP**        | Mathematics for the FTN P1 entrance exam + guide to Novi Sad faculties |
| Winter 2026/27 | **Pilot**      | 2–3 schools, feedback from maturanti, new content                      |
| Spring 2027    | **Full cycle** | Complete preparation before the June exam; expansion to ETF and FON    |

Long term: a platform ready for the state matura (2028/29) — before the system itself arrives.

## Architecture

- **apps/web** — Next.js frontend (KaTeX for math rendering)
- **apps/api** — Go monolith: accounts (Google OAuth), progress, simulation results
- **content/** — tasks and solutions as versioned files, reviewed via pull requests
- **tools/** — content pipeline (LaTeX → structured tasks)

User data lives in Postgres; educational content lives in git.

## Run locally

Node.js 22.13 or newer is required for the web application:

```bash
cd apps/web
npm ci
npm run dev
```

Open <http://localhost:3000>. Guest learning flows work without an account. For
the full stack, including Postgres, OAuth, and GraphQL, follow
[apps/api/README.md](apps/api/README.md).

## Licensing

- Code — [MIT](LICENSE)
- Educational content (`content/`) — [CC BY-NC-SA 4.0](content/LICENSE.md): free to use and share with attribution, commercial use prohibited

## Languages

Canonical educational content is in Serbian (Latin script), matching the real exam. The complete interface is available in Serbian, English, and Russian. Code and primary technical documentation are in English.
