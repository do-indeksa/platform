# 0005 — Echo as the HTTP framework

**Status:** accepted · 2026-07-12

**Context.** Candidates: chi (thin router over net/http), echo (net/http-based framework), Fiber (fasthttp — rejected: breaks stdlib ecosystem compatibility for throughput this project will never need).

**Decision.** Echo: maintainer preference, built-in binding/validation, unified error handling (handlers return `error`), net/http underneath so stdlib tooling keeps working.

**Consequences.** Handlers use `echo.Context`; stdlib middleware needs echo adapters.
