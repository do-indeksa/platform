# 0072 - Pin the golangci-lint tool version

**Status:** accepted - 2026-08-17

## Context

The API workflow pinned `golangci-lint-action` to an immutable commit but did
not provide its `version` input. On exact main
`4b988803de83630b36e9a87ebe2706b9aa7cf088`, the action failed before linting
because GitHub returned HTTP 429 while it requested the version mapping from
`golangci-lint/HEAD`. Re-running the unchanged commit passed.

The pinned action source resolves an omitted or minor-only version through that
mutable remote mapping. A complete `vMAJOR.MINOR.PATCH` input returns directly
without making the mapping request. Pinning only the action implementation is
therefore insufficient to make tool selection deterministic.

## Decision

The API lint step pins `golangci-lint` to `v2.12.2`, the release used for local
acceptance of the current API. The action remains pinned to its immutable
commit. Upgrades change both reviewed metadata and the complete tool version in
one pull request when necessary.

A repository policy test parses the workflow YAML and requires every
`golangci-lint-action` step to provide a complete semantic patch version. This
guards the behavior rather than one permanent release number, so an intentional
upgrade remains a one-line workflow change.

## Consequences

API lint no longer needs the action's mutable `HEAD` mapping before it can
install or restore the selected tool. Cache misses and release downloads can
still depend on external services, but tool identity does not drift and the
observed mapping-specific false failure is removed.

The repository job depends on Ruby's standard YAML parser, already present on
the supported developer and GitHub-hosted runner environments. A real pull
request and exact-main API run remain acceptance evidence that the pinned tool
installs and executes in GitHub Actions.

References:

- [golangci-lint-action usage](https://github.com/golangci/golangci-lint-action#how-to-use)
- [Pinned action version resolution](https://github.com/golangci/golangci-lint-action/blob/ba0d7d2ec06a0ea1cb5fa41b2e4a3ab91d21278a/src/version.ts#L168-L180)
- [Observed failed workflow attempt](https://github.com/do-indeksa/platform/actions/runs/32035769067/attempts/1)
