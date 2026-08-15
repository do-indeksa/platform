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

OAuth origins are parsed and compared as structured scheme/host/port values.
`CANONICAL_WEB_ORIGIN` and every comma-separated `EXTRA_WEB_ORIGINS` entry must
use canonical lowercase form without credentials, a path, query, fragment,
trailing slash, or default port. Non-loopback origins require HTTPS. The optional
`PREVIEW_ORIGIN_SUFFIX` is a scoped hostname suffix beginning with `-`, such as
`-scope.vercel.app`; provider-wide suffixes such as `.vercel.app` are rejected.
Invalid origin configuration stops startup before the database is contacted.

The generated HTTP API is registered at `/api/v1/*` for canonical same-origin
traffic and at `/v1/*` for internal compatibility. Production edge routing sends
`/api/v1/*` directly to this service without a Next.js proxy or path rewrite.

## Container

```sh
docker build -t do-indeksa-api apps/api
```

The final distroless image runs as the fixed non-root UID/GID `65532:65532` and
exposes `GET /healthz` on port 8080. Runtime credentials are injected by the
deployment platform, never during the image build.
