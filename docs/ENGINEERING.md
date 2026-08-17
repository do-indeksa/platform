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

- Thin gqlgen resolver or HTTP handler → service → **sqlc** (type-safe SQL, no ORM)
- Postgres via pgx; migrations via goose
- Bound every Postgres connection attempt and all pre-listen database startup work
- Give scheduled database maintenance an operation deadline and matching query indexes
- Propagate each request context through external I/O; keep execution below the socket write timeout
- Keep graceful shutdown longer than request execution and deployment termination grace longer than both
- Log requests through the fixed JSON allowlist; use only server-owned request IDs and route templates
- Pass operational errors through `safelog.Error`; never log raw error text, types, dependency details, or request data
- Treat preformatted standard-library or dependency log messages as untrusted input; discard them instead of parsing or redacting them
- No interfaces until a second implementation exists
- Ubiquitous language everywhere: topic, exam position, blueprint, task, run, attempt, knowledge map
- GraphQL owns product reads and mutations; OAuth redirects, callbacks, logout, and health remain HTTP endpoints

## Frontend (Next.js)

- App Router, Server Components by default (content pages are server-rendered — SEO)
- Client components only for interactive islands: timer, solver, charts
- TypeScript strict, no `any`
- State: **Zustand scoped to the exam/solver runtime** (timer, answers, current task) with `persist` middleware — a page refresh must not kill a four-hour attempt. Everything else is server state.
- Content from `content/` is loaded at build time

## Linting (blocking in CI)

- Go: golangci-lint — govet, staticcheck, errcheck, revive; formatting via gofumpt
- Web: ESLint (`next/core-web-vitals`) + Prettier
- Repository: actionlint for workflows and gitleaks across complete Git history
- Code scanning: CodeQL for Go, JavaScript/TypeScript, and GitHub Actions on code changes and weekly
- Runtime: every workflow job has an explicit timeout based on observed duration with cold-cache headroom

## Testing policy

| Kind                | Covers                                                                                   | Rule                                                      |
| ------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Unit (table-driven) | Domain core: P1 scoring, variant generator, knowledge-map calc, score-calculator formula | Mandatory, ~80%+ — a wrong score destroys user trust      |
| Integration         | API endpoints against real Postgres (testcontainers)                                     | Golden path per endpoint                                  |
| Race detection      | Complete Go API suite, including database integration tests                              | Dedicated CI check, serial packages on every API change   |
| Component           | Timer, solution reveal, answer submission (Vitest + Testing Library)                     | Critical interactions only                                |
| Content validation  | Frontmatter, checks, LaTeX render, source hashes, provenance, verification records       | **Blocking CI check** — broken content breaks the product |
| E2E (Playwright)    | Guest shell, practice, diagnostic, mock, plan, history, guide across responsive layouts  | Blocking critical-path regression suite                   |

## Coverage

No repo-wide coverage gate during MVP (gates on a 3-week sprint incentivize gaming the number). Target ~80% on domain packages; revisit at pilot.
