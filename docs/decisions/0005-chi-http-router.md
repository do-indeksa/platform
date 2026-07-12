# 0005 — chi as the HTTP router

**Status:** accepted · 2026-07-12

**Context.** Candidates: chi (thin router over net/http), echo (net/http-based framework), Fiber (fasthttp — rejected: breaks stdlib ecosystem compatibility for throughput this project will never need). Echo was briefly chosen on assumed maintainer familiarity; the maintainer's production stack turned out to be GraphQL→gRPC, so familiarity favors neither.

**Decision.** chi: pure `net/http` handlers, minimal API surface, stdlib idioms — knowledge transfers to any Go HTTP work. Echo's error-returning handlers are replicated with a small helper.

**Consequences.** Request binding/validation written by hand — trivial at this endpoint count.
