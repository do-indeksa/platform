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

Diagnostics with a complete `answerPartCount` item snapshot use the restorable
contract: ten deterministic FTN P1 items, a causal prefix of one AUTO attempt
per completed item, and at most one exact-shape draft for the next item. An
attempt atomically consumes its current draft and advances the checkpoint
ordinal without changing the client's CAS version. Rows without the snapshot
retain the legacy contract; partial snapshots fail closed.

Practice runs with the same complete snapshot marker use a bounded restorable
contract for one to 30 immutable tasks. Exam positions may repeat, while each
item keeps up to 20 deterministic, causally ordered AUTO attempts until a
correct or skipped terminal outcome. Versioned exact-shape drafts identify the
next attempt and are consumed atomically; a run may submit after at least one
attempt. Legacy practice runs without snapshots remain permissive.

OAuth origins are parsed and compared as structured scheme/host/port values.
`CANONICAL_WEB_ORIGIN` and every comma-separated `EXTRA_WEB_ORIGINS` entry must
use canonical lowercase form without credentials, a path, query, fragment,
trailing slash, or default port. Non-loopback origins require HTTPS. The optional
`PREVIEW_ORIGIN_SUFFIX` is a scoped hostname suffix beginning with `-`, such as
`-scope.vercel.app`; provider-wide suffixes such as `.vercel.app` are rejected.
Invalid origin configuration stops startup before the database is contacted.

Token exchange and userinfo retrieval share one ten-second deadline and one
redirect-denying HTTP client. Userinfo responses are capped at 64 KiB and must
contain exactly one JSON value. Provider transport, status, and response details
are reduced to a stable `502 oauth_provider_unavailable`; authorization codes,
PKCE verifiers, access tokens, upstream URLs, headers, and bodies are never
included in returned or logged errors.

OAuth return paths are parsed as bounded absolute-path references rather than
checked by string prefix. Scheme and authority forms, browser-significant
backslashes, encoded path separators, controls, malformed escapes, and values
over 2 KiB fall back to `/` before state is sealed. Callback state and preview
handoff rows are validated again before token exchange, session issue, or any
redirect.

HTTPS sessions use the host-prefixed `__Host-di_session` cookie with `Secure`,
`HttpOnly`, `SameSite=Lax`, `Path=/`, and no `Domain` attribute. Explicit HTTP
loopback development uses `di_session`; production does not accept that legacy
name as a fallback.

Every unsafe API request requires an exact configured browser `Origin`, or an
equivalent `Referer` origin when `Origin` is unavailable, before endpoint
authentication runs. This also applies when `SameSite=Lax` omits the session
cookie, preventing cross-site logout responses from deleting it.

The generated HTTP API is registered at `/api/v1/*` for canonical same-origin
traffic and at `/v1/*` for internal compatibility. Production edge routing sends
`/api/v1/*` directly to this service without a Next.js proxy or path rewrite.

Authenticated `DELETE /v1/me` (and its canonical `/api/v1/me` alias) removes
the user selected by the current unexpired session in one SQL statement. The
database foreign keys cascade through every server-owned session, handoff code,
attempt, run, checkpoint, preparation preference, and training draft. A missing,
expired, or already consumed session returns the same unauthorized response.
Browser-local data is outside this API boundary and must be cleared by the
future settings UI after the server confirms deletion.

## Container

```sh
docker build -t do-indeksa-api apps/api
```

The final distroless image runs as the fixed non-root UID/GID `65532:65532` and
exposes `GET /healthz` on port 8080. Runtime credentials are injected by the
deployment platform, never during the image build.
