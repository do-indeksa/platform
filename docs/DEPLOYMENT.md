# Production deployment contract

**Status:** architecture accepted; production rollout is not yet applied.

The canonical public origin is `https://doindeksa.rs`. Cloudflare is the only
public HTTP entry point. The Kubernetes origin stays private and is reached by
an outbound-only, application-specific Cloudflare Tunnel.

## Traffic contract

```text
browser -> Cloudflare edge -> dedicated cloudflared replicas
                              |-> Go API ClusterIP
                              `-> Next.js ClusterIP
```

Tunnel ingress rules are ordered and end in a `404` catch-all:

| Public request                           | Internal target   | Notes                                      |
| ---------------------------------------- | ----------------- | ------------------------------------------ |
| `doindeksa.rs/graphql`                   | Go API            | no cache; body and complexity limits apply |
| `doindeksa.rs/api/v1/*`                  | Go API            | no cache; OAuth and sessions stay HTTP     |
| `doindeksa.rs/*`                         | Next.js           | immutable static assets may be cached      |
| any other host not explicitly configured | `http_status:404` | never falls through to a shared service    |

`cloudflared` does not rewrite the API prefix. Before rollout, the Go router
must expose `/api/v1/*` directly while retaining `/v1/*` only as internal
compatibility. Next.js rewrites remain local-development and preview behavior.

The public `GET /healthz` belongs to Next.js and confirms only that the web
process is serving. Kubernetes probes call the Go service directly inside the
cluster: `GET /healthz` for dependency-free liveness and `GET /readyz` for a
bounded Postgres readiness check. The API probe paths are not public Tunnel
routes. The readiness probe sets `timeoutSeconds: 3` or greater so the
application's two-second dependency deadline remains the first failure bound.
The API does not open its listener until bounded database initialization
finishes. A future Kubernetes `startupProbe` must therefore allow more than the
application's two-minute initialization deadline before liveness can restart
the container.

The optional `www.doindeksa.rs` host redirects to the apex at the Cloudflare
edge. OAuth callbacks, cookies, canonical URLs, redirects, CSP sources, and
runtime assets use only the apex origin.

## Origin isolation

- Web-serving DNS contains only Cloudflare-managed, proxied records; it has no
  origin `A` or `AAAA` record.
- The application has ClusterIP Services only. It creates no public HTTPRoute,
  Ingress, LoadBalancer, NodePort, external-dns annotation, or public origin
  certificate.
- `cloudflared` connects directly to service DNS names. A final catch-all rule
  returns `404`, so an unrecognized Host cannot reach another cluster service.
- NetworkPolicy permits app ingress only from dedicated tunnel pods and
  explicitly selected monitoring pods and ports. HTTP health checks remain
  internal. Direct-IP requests with a forged `Host: doindeksa.rs` must fail at
  the public platform entry point.
- The edge bypasses cache for `/graphql`, `/api/v1/*`, OAuth responses, and any
  response carrying a session cookie. Only fingerprinted static assets receive
  long-lived public caching.

Cloudflare documents Tunnel as outbound-only with no inbound origin ports and
supports ordered hostname/path rules with a required catch-all. See the
[Tunnel overview](https://developers.cloudflare.com/tunnel/),
[ingress configuration](https://developers.cloudflare.com/tunnel/advanced/local-management/configuration-file/),
and [firewall model](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/).

## Workload and credentials

- Pin the `cloudflared` image by digest and run at least two replicas as
  non-root with a read-only root filesystem, dropped capabilities, runtime
  default seccomp, and no service-account token.
- Store the dedicated tunnel credential as a strict-scoped SealedSecret in the
  private GitOps repository. Do not give the pod a Cloudflare account API token.
- Provision DNS with a separate zone-scoped credential. Never broaden an
  unrelated infrastructure token to gain access to this zone.
- Keep database, OAuth, session, tunnel, registry, and analytics credentials in
  separate least-privilege Secrets. None may enter image layers, build args,
  public CI logs, or this repository.
- App CI publishes immutable commit-SHA images only. Kargo promotion and ArgoCD
  reconciliation remain the sole production mutation path.
- Keep the effective database `connect_timeout` at 30 seconds or less. The
  application supplies five seconds when it is omitted or zero and rejects a
  larger value before opening a pool.
- Give the private API workload a `terminationGracePeriodSeconds` value greater
  than the application's 30-second graceful-shutdown budget. Use at least 35
  seconds so Kubernetes does not send `SIGKILL` as the application exhausts its
  own drain deadline.

## Release gates

1. Validate and unit-test every Tunnel URL match, including the final `404`.
2. Confirm web DNS resolves only through Cloudflare and certificate
   transparency contains no shared hostname or unintended SAN.
3. Confirm direct origin requests, including a forged canonical Host header,
   cannot reach the application.
4. Verify `/`, static assets, `/graphql`, `/api/v1/me`, OAuth login/callback,
   logout, cookie attributes, redirects, CSP, and all three locales at the edge.
   Same-origin cookie mutations must succeed; cross-origin GraphQL, attempt, and
   logout requests must return `403` without changing persisted state.
5. On a disposable production-shaped Neon branch, start at least two API
   replicas concurrently through the configured connection mode. Confirm each
   migration version is applied once, the table lease is released, and user and
   attempt persistence work without logging credentials or session values.
   Before applying migration 11 to non-empty production auth tables, inspect
   their size and confirm the normal index-build lock fits the rollout window;
   use a separately reviewed non-transactional concurrent migration if it does
   not.
6. Verify current backup health and perform a disposable restore proof before
   promotion. Record the prior image SHAs and tested rollback command.
7. Scan rendered private manifests, public tracked files, response headers,
   source maps, and browser network requests for origin-identifying values.
8. Verify internal API liveness remains healthy while readiness returns `503`
   during a controlled database outage.

## Rollback

Rollback promotes the previously verified immutable web and API image SHAs.
Tunnel and DNS configuration stay unchanged unless they caused the incident;
in that case, restore the previous validated Tunnel config first. Database
migrations must be backward-compatible with the previous application version.
