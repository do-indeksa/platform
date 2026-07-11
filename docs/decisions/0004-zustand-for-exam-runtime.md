# 0004 — Zustand scoped to the exam runtime

**Status:** accepted · 2026-07-12

**Context.** Most app state is server/content data (Server Components). The genuinely client-side state is the running exam: 180-minute timer, answers, current task. A refresh or crash must not destroy an attempt.

**Decision.** Zustand with `persist` middleware (localStorage) for the exam/solver runtime only. No global client store; server state stays on the server.

**Consequences.** Minimal client-state surface; attempt survives reloads; store logic is small enough to unit-test alongside scoring.
