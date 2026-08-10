# web

Next.js frontend. KaTeX for math rendering.

```
npm run dev      # local dev server
npm run lint     # eslint
npm run build    # production build
```

## Analytics

Self-hosted Umami is optional and disabled by default. Set all three of
`NEXT_PUBLIC_UMAMI_SCRIPT_URL`, `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, and the
comma-separated `NEXT_PUBLIC_UMAMI_DOMAINS` at build time. The tracker respects
Do Not Track and excludes URL query strings and hashes.

Only anonymous page views and the `task-solved` event are collected. Custom
event data is limited to the learning mode, exam position, and optional help
level; never add answers or application account, task, or run identifiers.
