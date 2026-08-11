# 0008 — Deployment: Railway for api, Neon for Postgres

**Status:** superseded by [0012](0012-kubernetes-kargo-neon-deployment.md) - 2026-08-10

**Context.** k3s + ArgoCD on a personal VPS is a day of setup plus ongoing ops for a single tiny service. Verified Railway pricing: Go API alone ≈ $0.5–0.8/mo, fits the Free plan's $1/mo credit; adding Postgres (~$3.5/mo) does not.

**Decision.** API — Railway Free plan, deployed from GitHub. Postgres — Neon free tier. Upgrade to Railway Hobby ($5/mo) at public launch: Free stops workloads when the credit runs out, unacceptable with real users.

**Consequences.** No `deploy/` manifests, no GHCR pipeline. Web stays on Vercel per 0006.
