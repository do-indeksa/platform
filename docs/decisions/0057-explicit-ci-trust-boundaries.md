# 0057 - Make CI trust boundaries explicit

**Status:** accepted - 2026-08-14

## Context

The repository currently grants `GITHUB_TOKEN` read-only access and prevents it
from approving pull requests. The API and web workflows inherited that setting,
however, so their effective permissions could change if the repository default
changed. Checkout also configured its token for later Git commands even though
none of the workflows performs an authenticated fetch or push after checkout.

Only the image workflow cancelled an obsolete run after a newer commit reached
the same pull request or branch. API and browser jobs are comparatively long, so
stacked development could spend runner time validating commits that GitHub no
longer presents as the head of the ref.

## Decision

Every workflow declares `contents: read` at workflow scope. Unspecified token
permissions therefore become `none`, independently of the repository default.
Every checkout step sets `persist-credentials: false`; later Git commands can
still inspect the checkout but do not receive implicit authenticated access.

Every workflow also uses `${{ github.workflow }}-${{ github.ref }}` as its
concurrency group and enables `cancel-in-progress`. The workflow name prevents
API, web, and image runs from cancelling one another, while the ref keeps
different pull requests and branches independent.

Deployment registry secrets remain limited to image jobs triggered by pushes.
This decision neither expands their availability nor grants any write permission
to `GITHUB_TOKEN`.

## Consequences

CI permissions are reviewable in source and remain least-privileged if repository
settings drift. Repository code and tools executed after checkout cannot reuse a
checkout credential for an authenticated Git operation. A new commit replaces
obsolete work for the same workflow and ref, while independent checks continue
to run concurrently.

Any future workflow that must write to GitHub must request the narrow permission
at job scope and justify why checkout credentials need to persist. Jobs that
publish artifacts or deployments must continue to scope their separate
credentials to the smallest event and step boundary.

References:

- [GitHub Actions workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)
- [`actions/checkout` credential persistence](https://github.com/actions/checkout#usage)
- [GitHub Actions concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
