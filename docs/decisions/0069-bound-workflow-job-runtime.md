# 0069 - Bound GitHub Actions job runtime

**Status:** accepted - 2026-08-14

## Context

Workflow concurrency canceled superseded runs, but every job except CodeQL
inherited GitHub Actions' six-hour maximum. A stalled testcontainer, browser
install, Docker build, vulnerability database download, registry request, or
test process could therefore consume a runner long after the normal job budget.

Recent successful runs completed in approximately two minutes for each API
job, six minutes for web CI, three minutes for the web image, one minute for the
API image and repository safety, and seconds for image selection. The limits
need enough cold-cache and network headroom without treating a multi-hour hang
as useful work.

## Decision

Every workflow job has an explicit `timeout-minutes`:

| Job | Limit |
| --- | ---: |
| API CI and race | 20 minutes |
| Web CI | 30 minutes |
| Image selection | 5 minutes |
| API and web image matrix | 30 minutes |
| Repository safety | 15 minutes |
| CodeQL language matrix | 30 minutes |

The timeout is a job-level execution bound. Existing triggers, permissions,
concurrency cancellation, matrices, steps, failure artifacts, image selection,
and publication conditions remain unchanged.

## Consequences

A deadlocked local service or unavailable external tool now fails within a
bounded interval instead of occupying a runner for hours. Normal successful
runs retain at least several times their recently observed duration.

A timeout is a failure to investigate, not a reason to raise the value
automatically. A change to a budget requires evidence from successful and
timed-out runs, while a newly long-lived task should usually become a separately
owned job with its own contract.

A structured YAML audit verifies that every tracked job has a positive timeout.
A real pull request remains the final proof that API, browser, repository,
CodeQL, and image jobs complete inside their configured budgets.

References:

- [GitHub Actions job timeout](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes)
- [GitHub Actions usage limits](https://docs.github.com/en/actions/reference/limits)
