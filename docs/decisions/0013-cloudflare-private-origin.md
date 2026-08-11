# 0013 - Cloudflare Tunnel private production origin

**Status:** accepted - 2026-08-11 - supersedes the public-ingress part of [0012](0012-kubernetes-kargo-neon-deployment.md).

**Context.** `doindeksa.rs` must not reveal or permit direct access to its Kubernetes origin or create a public association with unrelated services.

**Decision.** Cloudflare owns public DNS and edge TLS; an outbound-only dedicated Tunnel reaches internal-only web and API Services. `/graphql` and `/api/v1/*` go to Go, all other canonical-host paths go to Next.js, and unmatched hosts return 404.

**Security.** There is no public app HTTPRoute, LoadBalancer, NodePort, origin certificate, or DNS record to an origin address. Tunnel credentials are dedicated, least-privilege, and sealed only in the private GitOps repository.
**Consequences.** The Go API must accept `/api/v1/*` directly before rollout; Next.js remains out of the production API path. The executable contract and release gates are in [../DEPLOYMENT.md](../DEPLOYMENT.md).
