# Engineering Guide

Decisions with rationale live in [docs/decisions/](decisions/) (ADRs). This guide is the day-to-day reference.

## Monorepo layout

```
apps/web        Next.js frontend
apps/api        Go monolith
content/        tasks, solutions, guide data (versioned, PR-reviewed)
tools/          content pipeline (LaTeX → structured tasks)
docs/           product & engineering docs, ADRs
```

## Backend (Go)

```
apps/api/
  cmd/api/main.go          entrypoint, wiring
  internal/
    task/                  package by feature, not by layer
    simulation/            each: handler.go, service.go, queries.sql
    progress/
    auth/
    guide/
  db/migrations/           goose
```

- Thin handler → service → **sqlc** (type-safe SQL, no ORM)
- Postgres via pgx; migrations via goose
- No interfaces until a second implementation exists
- Ubiquitous language everywhere: slot, task, variant, attempt, knowledge map

## Frontend (Next.js)

- App Router, Server Components by default (content pages are server-rendered — SEO)
- Client components only for interactive islands: timer, solver, charts
- TypeScript strict, no `any`
- State: **Zustand scoped to the exam/solver runtime** (timer, answers, current task) with `persist` middleware — a page refresh must not kill a 180-minute attempt. Everything else is server state.
- Content from `content/` is loaded at build time

## Linting (blocking in CI)

- Go: golangci-lint — govet, staticcheck, errcheck, revive; formatting via gofumpt
- Web: ESLint (`next/core-web-vitals`) + Prettier

## Testing policy

| Kind | Covers | Rule |
|---|---|---|
| Unit (table-driven) | Domain core: P1 scoring, variant generator, knowledge-map calc, score-calculator formula | Mandatory, ~80%+ — a wrong score destroys user trust |
| Integration | API endpoints against real Postgres (testcontainers) | Golden path per endpoint |
| Component | Timer, solution reveal, answer submission (Vitest + Testing Library) | Critical interactions only |
| Content validation | Every content file: frontmatter schema, answer present, LaTeX compiles | **Blocking CI check** — broken content breaks the product |
| E2E (Playwright) | Smoke: open → solve → see progress | Post-MVP, 2–3 scenarios |

## Coverage

No repo-wide coverage gate during MVP (gates on a 3-week sprint incentivize gaming the number). Target ~80% on domain packages; revisit at pilot.
