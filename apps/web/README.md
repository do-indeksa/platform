# web

Next.js frontend. KaTeX for math rendering.

```
npm run dev      # local dev server
npm run lint     # eslint
npm run build    # production build
npm start        # standalone production server
```

## Container

Build from the repository root so the image includes the versioned content:

```sh
docker build -f apps/web/Dockerfile -t do-indeksa-web .
docker run --rm -p 3000:3000 do-indeksa-web
```

The distroless standalone server runs as the fixed non-root UID/GID
`65532:65532`.
`GET /healthz` checks the web process without locale redirects; a request to
`/tasks` also proves that runtime content is present.

## Analytics

Self-hosted Umami is optional and disabled by default. Set all three of
`NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, and the
comma-separated `NEXT_PUBLIC_UMAMI_DOMAINS` at build time. The tracker respects
Do Not Track and excludes URL query strings and hashes.

Only anonymous page views and the `task-solved` event are collected. Custom
event data is limited to the learning mode, exam position, and optional help
level; never add answers or application account, task, or run identifiers.
