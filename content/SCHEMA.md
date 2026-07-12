# Task file schema

One file = one task: `content/tasks/<topic-slug>/<id>.md`

## Frontmatter

| Field | Type | Values |
|---|---|---|
| `id` | string | `<prefix>-NNN`, unique repo-wide |
| `slot` | int | 1–10, position in the P1 exam |
| `topic` | string | topic slug from `topics.yaml` |
| `difficulty` | int | 1–5 |
| `source` | string | e.g. `FTN 2019`, `ETF 2024, br. 2`, `Do indeksa (autorski)` |
| `origin` | string | traceability to the LaTeX source file |
| `status` | string | `draft` → `review` → `verified` |
| `answer` | string | final answer, LaTeX inline math allowed |

## Body

```markdown
## Zadatak

Statement in Serbian (latin script). LaTeX math: $...$ inline, $$...$$ display.

## Rešenje

Full worked solution in Serbian.
```

## Rules

- Serbian latin script only, matching the real exam.
- Multi-part tasks keep their a) b) v) structure inside the statement; `answer` lists parts separated by `;`.
- A task enters the platform only with `status: verified` (reviewed via PR).
