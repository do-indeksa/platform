# 0058 - Gate dependency changes after graph enablement

**Status:** accepted - 2026-08-17

## Context

GitHub dependency review compares the dependency graphs of a pull request's
base and head commits. The repository's dependency graph was disabled, so the
public dependency page reported that state and the SBOM endpoint returned 404.
Adding a required-looking workflow before enabling its data source would have
created a permanently failing check.

Dependabot security updates, vulnerability alerts, secret scanning, and push
protection were already enabled. The missing prerequisite was the dependency
graph itself, not a broader repository security bundle.

## Decision

Enable the repository dependency graph without enabling automatic dependency
submission or changing any other security setting. The public dependency page
and default-branch SBOM endpoint must respond before the review workflow is
introduced.

Every pull request runs `actions/dependency-review-action` 5.0.0 pinned to its
exact commit. The workflow grants `GITHUB_TOKEN` only `contents: read`, performs
no checkout, references no repository secret, and does not run on pushes.

New dependencies fail the check when GitHub reports a HIGH or CRITICAL
vulnerability in runtime, development, or unknown scope. Vulnerability checking
is explicit. License enforcement, pull-request comments, and OpenSSF Scorecard
output remain disabled until the project adopts policies for those signals and
justifies any additional permission.

## Consequences

Dependency changes now receive a repository-owned vulnerability diff instead
of relying only on periodic alerts. Unrelated source-only pull requests still
run the check, but normally produce an empty dependency diff.

The graph is a GitHub-hosted data source and can be populated asynchronously
after first enablement. The workflow result on a real pull request is therefore
part of acceptance; an enabled setting or successful SBOM request alone is not
enough.

This decision does not change dependencies, license policy, deployment,
registry, DNS, cluster state, or repository write permissions.

References:

- [Enabling the dependency graph](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/enable-dependency-graph)
- [Dependency review action 5.0.0](https://github.com/actions/dependency-review-action/releases/tag/v5.0.0)
