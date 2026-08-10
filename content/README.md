# Content

Structured educational content: tasks, solutions, and the faculty guide.

- Tasks and solutions are stored as versioned files and reviewed via pull requests.
- Serbian (latin script), matching the real exam.
- Licensed under CC BY-NC-SA 4.0 — see [LICENSE.md](LICENSE.md).

## Sources and imports

Independently authored LaTeX snapshots live in `sources/` with SHA-256 values.
The importer under `tools/content/` extracts structural task selectors, creates
isolated drafts from reviewer manifests, and checks that every current `origin`
still resolves to a statement and solution. Generated material is never marked
`verified`; that status remains an explicit maintainer review decision.

Versioned evidence for manually promoted topic packs lives in `reviews/`. CI
requires every `verified` task to appear in exactly one record, and each listed
topic must be reviewed in full.

## Faculty guide

`guide/ftn/catalog.yaml` is the canonical FTN exam-to-program directory. It
contains only current groups confirmed by the linked official source. Every
program belongs to exactly one primary entrance-exam group; product support is
tracked separately through each group's `available` or `planned` status.

`guide/ftn/cutoffs.yaml` stores sourced historical admission thresholds for the
calculator. Thresholds are guidance by year, not a prediction or a substitute
for the current call for applications.
