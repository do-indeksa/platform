# Task file schema

One file = one task: `content/tasks/<topic-slug>/<id>.md`

## Frontmatter

| Field        | Type   | Values                                                      |
| ------------ | ------ | ----------------------------------------------------------- |
| `id`         | string | `<prefix>-NNN`, unique repo-wide                            |
| `slot`       | int    | 1–10, position in the P1 exam                               |
| `topic`      | string | topic slug from `topics.yaml`                               |
| `difficulty` | int    | 1–5                                                         |
| `source`     | string | e.g. `FTN 2019`, `ETF 2024, br. 2`, `Do indeksa (autorski)` |
| `origin`     | string | traceability to the LaTeX source file                       |
| `status`     | string | `draft` → `review` → `verified`                             |
| `answer`     | string | final answer for display, LaTeX inline math allowed         |
| `check`      | list   | machine-checkable answer parts, see below                   |

## Check

```yaml
check:
  - label: "b)" # optional when the task has a single checked part
    kind: value # value | values | interval | text
    expected: "2sqrt(3)"
```

`expected` uses input syntax, not LaTeX: `sqrt(3)`, `pi`, `e`, `inf`,
`ln` (natural log), `log` (base 10), `log2`, `x` in expression answers
(`-2x+2`). Kind `values` lists a solution set (`0, 2`); kind `interval`
lists a union with bracket types (`(-inf,0)u(2,inf)`). Equivalence is
numeric, so any equivalent exact form passes. Parts that cannot be
machine-checked (domains, monotonicity, sketches) are omitted — the
solution covers them. A task requires 1–6 checked parts; this bound is shared by
practice, diagnostic, and simulation flows.

## Body

```markdown
## Zadatak

Statement in Serbian (latin script). LaTeX math: $...$ inline, $$...$$ display.

## Nagoveštaj 1

Direction of thought, never the final answer.

## Nagoveštaj 2

First concrete step; formulas copied verbatim from the solution.

## Rešenje

Full worked solution in Serbian.
```

Hint sections are optional, at most two, in order, before `## Rešenje`.

## Import provenance

Imported authored tasks use an origin in the form
`<statement-file>.tex, slot <1-10>, zadatak <selector>`, where a selector is a
task number (`3`) or a subtask (`3a`). The content pipeline resolves the same
selector in both the statement and solution workbooks. Its manifest must supply
exactly two hints and 1–6 machine-check parts, and it can emit only
`draft` or `review` status.

## Verification records

Changing a task to `verified` requires a Markdown record in `reviews/`. Its
frontmatter names the verification date, methods, and complete task list for
every promoted topic. CI rejects unrecorded verified tasks, duplicate records,
and partial topic reviews. The record body contains concise independent
calculation evidence; the corresponding pull request carries the review trail.

## Rules

- Serbian latin script only, matching the real exam.
- Multi-part tasks keep their a) b) v) structure inside the statement; `answer` lists parts separated by `;`.
- `draft` tasks never reach the platform. `review` and `verified` are published; `review` marks a task awaiting final maintainer verification.
