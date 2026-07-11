# 0001 — Go monolith + Next.js frontend

**Status:** accepted · 2026-07-11

**Context.** Solo developer, fastest in Go; hard MVP deadline (end of July 2026); modest load (hundreds of users). Considered: microservices, NestJS, FastAPI.

**Decision.** Single Go service (chi/echo + pgx + sqlc) for user data; Next.js + KaTeX frontend; Postgres. No microservices, no framework experiments on a deadline.

**Consequences.** One deploy target, minimal ops. If load ever demands it, the monolith splits along `internal/` package boundaries.
