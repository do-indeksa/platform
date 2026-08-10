# api

Go monolith. Serves user data only — content lives in `content/`.

```
go run ./cmd/api    # local server on :8080
go test ./...
```

The service requires Postgres plus the variables documented in `.env.example`.
It applies embedded goose migrations before accepting traffic. OAuth redirects,
callbacks, logout, and health use HTTP; product reads and writes use GraphQL.

## Container

```sh
docker build -t do-indeksa-api apps/api
```

The final distroless image runs as the fixed non-root UID/GID `65532:65532` and
exposes `GET /healthz` on port 8080. Runtime credentials are injected by the
deployment platform, never during the image build.
