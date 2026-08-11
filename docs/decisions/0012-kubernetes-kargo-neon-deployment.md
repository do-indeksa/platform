# 0012 - Kubernetes, Kargo, and Neon deployment

**Status:** superseded by [0013](0013-cloudflare-private-origin.md) - 2026-08-11; superseded [0008](0008-railway-neon-deploy.md).

**Context.** The project selected an owner-managed Kubernetes platform, immutable application images, GitOps promotion, and managed Postgres.

**Historical decision.** The first topology attached the canonical host directly to a public cluster Gateway and used path routing for the web and API.

**Reason superseded.** A public origin route can disclose infrastructure and permit edge bypass; delivery and data choices remain, but public ingress moves to an outbound-only tunnel.
