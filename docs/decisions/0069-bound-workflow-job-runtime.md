# 0069 - Bound GitHub Actions job runtime

**Status:** accepted - 2026-08-17

## Context

Workflow concurrency cancels superseded runs, but every job except CodeQL
inherited GitHub Actions' 360-minute default. A stalled test container, browser
install, Docker build, vulnerability database download, registry request, or
test process could therefore consume a runner long after the normal job budget.

Recent successful runs completed in roughly two minutes for each API job, six
minutes for web CI, three minutes for the slower runtime image, one minute for
repository safety, and seconds for image selection and dependency review. These
samples are sizing evidence rather than duration guarantees. The limits need
cold-cache and network headroom without treating a multi-hour hang as useful
work.

## Decision

Every workflow job has an explicit positive integer `timeout-minutes`:

| Job                      |      Limit |
| ------------------------ | ---------: |
| API CI and race          | 20 minutes |
| Web CI                   | 30 minutes |
| Image selection          |  5 minutes |
| API and web image matrix | 30 minutes |
| Repository safety        | 15 minutes |
| Dependency review        | 15 minutes |
| CodeQL language matrix   | 30 minutes |

The timeout is a job-level execution bound. Existing triggers, permissions,
concurrency cancellation, matrices, steps, failure artifacts, image selection,
and publication conditions remain unchanged.

## Consequences

A deadlocked local service or unavailable external tool now fails within a
bounded interval instead of occupying a runner for hours. Healthy runs retain
multiple times their recently observed duration for cold caches, larger test
fixtures, runner variance, and ordinary network latency.

A timeout is a failure to investigate, not a reason to raise the value
automatically. A budget change requires evidence from successful and timed-out
runs plus a written explanation of the added headroom. A newly long-lived task
should usually become a separately owned job with its own contract. Every new
job must declare its timeout in the same pull request that introduces it.

A structured YAML audit verifies that every tracked job has a positive integer
timeout. A real pull request remains the final proof that API, browser,
repository, dependency review, CodeQL, selection, and image jobs complete inside
their configured budgets.

References:

- [GitHub Actions job timeout](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes)
- [GitHub Actions usage limits](https://docs.github.com/en/actions/reference/limits)
