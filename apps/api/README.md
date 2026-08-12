# api

Go monolith. Serves user data only — content lives in `content/`.

```
go run ./cmd/api    # local server on :8080
go test ./...
```

The service requires Postgres plus the variables documented in `.env.example`.
It applies embedded goose migrations before accepting traffic. OAuth redirects,
callbacks, logout, and health use HTTP; product reads and writes use GraphQL.
The bounded `completedSimulationRuns` projection reconstructs the latest 20
submitted mock exams with three owner-scoped batch reads, independent of the
number of returned runs.

Active diagnostic and simulation runs expose a bounded versioned checkpoint.
Draft answers are relationally scoped to the run items, updates use an expected
server version, and submit or explicit abandon removes the mutable checkpoint
transactionally. Completed attempts remain append-only.

The generated HTTP API is registered at `/api/v1/*` for canonical same-origin
traffic and at `/v1/*` for internal compatibility. Production edge routing sends
`/api/v1/*` directly to this service without a Next.js proxy or path rewrite.

## Container

```sh
docker build -t do-indeksa-api apps/api
```

The final distroless image runs as the fixed non-root UID/GID `65532:65532` and
exposes two internal probes on port 8080:

- `GET /healthz` is a dependency-free process liveness probe.
- `GET /readyz` checks Postgres with a two-second deadline and returns `503`
  without dependency details when the service cannot accept user traffic.

Runtime credentials are injected by the deployment platform, never during the
image build.
