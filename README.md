# Do indeksa

**Free platform helping Serbian maturanti (final-year high-school students) choose a faculty and prepare for university entrance exams.**

> Srpska verzija: [README.sr.md](README.sr.md)

## Mission

Equal chances for admission — regardless of city or income. Quality preparation currently costs 20–30 € per private lesson, and the free alternatives are outdated collections and scattered PDFs. Do indeksa is the free, modern alternative.

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

## Licensing

- Code — [MIT](LICENSE)
- Educational content (`content/`) — [CC BY-NC-SA 4.0](content/LICENSE.md): free to use and share with attribution, commercial use prohibited

## Languages

Canonical educational content is in Serbian (Latin script), matching the real exam. Serbian is the current interface language; English and Russian are in the active localization roadmap. Code and primary technical documentation are in English.
