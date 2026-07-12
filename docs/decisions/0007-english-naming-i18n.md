# 0007 — English naming everywhere, UI text via i18n

**Status:** accepted · 2026-07-12

**Context.** MVP pages shipped with Serbian route segments (/zadaci, /kalkulator) and hardcoded Serbian strings in JSX. The maintainer rejects localized naming in code and URLs outright.

**Decision.** All identifiers, route segments and public URLs are English (/tasks, /calculator, /simulation). User-facing strings live in next-intl catalogs (`messages/`), Serbian (sr-Latn) is the default and only locale for now. Educational content in `content/` is data, not naming — stays Serbian.

**Consequences.** Adding locales later is a catalog file; no URL migrations ever needed.
