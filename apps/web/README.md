# web

Next.js frontend. KaTeX for math rendering.

```
npm run dev      # local dev server
npm run lint     # eslint
npm run build    # production build
npm start        # standalone production server
npm run test:e2e # functional browser suite
npm run test:visual # compare canonical visual baselines on Linux
```

## Visual regression

The blocking visual suite compares 21 first-viewport baselines across the
Serbian overview, task, empty plan, empty history, diagnostic result, rubric
review, and simulation result at mobile, tablet, and desktop sizes. It is
separate from functional E2E so failures identify the affected surface and
viewport.

Canonical PNGs must be generated in the pinned Linux/Chromium container:

```sh
npm run test:visual:update
```

Run the command only for an intentional UI change, inspect every PNG diff, and
commit the updated baselines with the corresponding implementation. Direct
snapshot updates on another host OS are not canonical.

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
`UMAMI_SCRIPT_URL`, `UMAMI_WEBSITE_ID`, and the comma-separated
`UMAMI_DOMAINS` at runtime. The same image can move between environments without
changing its immutable tag. The tracker respects Do Not Track and excludes URL
query strings and hashes.

Only anonymous page views and the `task-solved` event are collected. Custom
event data is limited to the learning mode, exam position, and optional help
level; never add answers or application account, task, or run identifiers.
