# 0012 - VMCore, Kargo, and Neon deployment

**Status:** accepted - 2026-08-10 - supersedes [0008](0008-railway-neon-deploy.md) and the production topology in [0006](0006-deployment.md)

## Context

The production Kubernetes platform now provides a two-node k3s cluster, Gateway
API, a private OCI registry, Kargo, ArgoCD, sealed secrets, monitoring, and
verified object-storage backups. Railway would duplicate that control plane and
would still require a separate database.

The cluster uses node-local storage without synchronous replication. Running the
only copy of user and analytics data there would create a larger recovery risk
than the application needs. A dedicated Neon project already exists in the same
European region and runs the current schema.

## Decision

The canonical production origin is `https://do-indeksa.coverflow.net`. Next.js
and the Go monolith run as separate non-root containers on VMCore.

GitHub Actions builds and smoke-tests both images for every relevant pull
request without registry credentials. A merge to `main` pushes only immutable
commit-SHA tags. Kargo discovers those tags and requires an explicit production
promotion; ArgoCD then reconciles the private infrastructure repository. The
application workflow never receives a GitOps deploy key and never writes to
infrastructure state.

The Gateway owns same-origin routing:

- `/api/v1/*` goes directly to the Go service and rewrites `/api/v1` to `/v1`;
- `/graphql` goes directly to the Go service;
- all other paths go to Next.js.

The Next rewrite remains only for local development and Vercel previews. It is
not on the production request path. OAuth redirects and callbacks stay under
`/api/v1/auth/*`, so the API can issue secure, HTTP-only, SameSite=Lax cookies
for the canonical origin without a cross-origin token handoff.

Product data remains in managed Neon Postgres. Product and Umami workloads use
separate databases and least-privilege roles. Connection strings, OAuth
credentials, and the session encryption key are strict-scoped SealedSecrets in
the private deployment repository; none are image build arguments. Umami runs
on VMCore and sends only the anonymous events defined in
[0011](0011-privacy-friendly-analytics.md).

Vercel may continue to build previews, but it is not the canonical production
runtime. Production rollback promotes a previously verified Kargo Freight and
lets ArgoCD reconcile the prior immutable image tags.

## Consequences

- Application compute, routing, analytics, and delivery remain self-hosted.
- Managed Postgres avoids making local-path storage the only copy of user data.
- The web image must carry the Git-backed `content/` tree because server routes
  read it at runtime.
- Public CI holds registry push credentials but no Kubernetes, GitOps, database,
  or OAuth credentials.
- Public deploys require both a green image workflow and an explicit Kargo
  promotion.
