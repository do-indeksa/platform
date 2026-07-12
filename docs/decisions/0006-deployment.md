# 0006 — Deployment: Vercel for web, own k3s for api

**Status:** superseded by [0008](0008-railway-neon-deploy.md) for api/db · 2026-07-12

**Context.** The frontend benefits from per-PR preview deployments. The maintainer already operates k3s + ArgoCD in production and hosts several services on his own infrastructure; managed PaaS for the API would duplicate what he runs anyway.

**Decision.** Web — Vercel (free tier, preview deploys out of the box), production: https://do-indeksa.vercel.app. API + Postgres — maintainer's VPS with k3s + ArgoCD: GitHub Actions builds the image → GHCR, ArgoCD syncs manifests from `deploy/` in this repo. Single-instance Postgres — no HA at this scale.

**Consequences.** API production deploy lands together with the first user-data feature (sprint 3), when the VPS is provisioned.
