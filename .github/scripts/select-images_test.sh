#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
selector="${script_dir}/select-images.sh"
checks=0
failures=0

assert_matrix() {
  local name="$1"
  local expected="$2"
  local actual
  shift 2
  checks=$((checks + 1))

  if ! actual="$("${selector}" "$@" 2>&1)"; then
    printf 'FAIL %s: selector rejected input: %s\n' "${name}" "${actual}" >&2
    failures=$((failures + 1))
    return
  fi
  if [[ "${actual}" != "${expected}" ]]; then
    printf 'FAIL %s: expected %s, got %s\n' "${name}" "${expected}" "${actual}" >&2
    failures=$((failures + 1))
  fi
}

assert_rejected() {
  local name="$1"
  local expected_status="$2"
  local actual
  local status
  shift 2
  checks=$((checks + 1))

  set +e
  actual="$("${selector}" "$@" 2>&1)"
  status=$?
  set -e
  if ((status == 0)); then
    printf 'FAIL %s: expected rejection, got %s\n' "${name}" "${actual}" >&2
    failures=$((failures + 1))
  elif ((status != expected_status)); then
    printf 'FAIL %s: expected status %d, got %d: %s\n' \
      "${name}" "${expected_status}" "${status}" "${actual}" >&2
    failures=$((failures + 1))
  fi
}

assert_matrix "main push" '["api","web"]' push
assert_matrix "main push ignores path filtering" '["api","web"]' push README.md
assert_matrix "API path" '["api"]' pull_request apps/api/cmd/api/main.go
assert_matrix "API Dockerfile" '["api"]' pull_request apps/api/Dockerfile
assert_matrix "web path" '["web"]' pull_request apps/web/src/app/page.tsx
assert_matrix "content path" '["web"]' pull_request content/tasks/example.md
assert_matrix "mixed application paths" '["api","web"]' pull_request \
  apps/api/cmd/api/main.go apps/web/src/app/page.tsx
assert_matrix "OpenAPI contract" '["api","web"]' pull_request apps/api/api/openapi.yaml
assert_matrix "Docker build context" '["api","web"]' pull_request .dockerignore
assert_matrix "image workflow" '["api","web"]' pull_request .github/workflows/images.yml
assert_matrix "image selector" '["api","web"]' pull_request .github/scripts/select-images.sh
assert_matrix "unrelated path with API" '["api"]' pull_request README.md apps/api/go.mod
assert_matrix "path containing spaces" '["web"]' pull_request \
  "apps/web/src/file with spaces.tsx"
assert_rejected "empty pull request" 1 pull_request
assert_rejected "unrelated pull request" 1 pull_request README.md
assert_rejected "unsupported event" 2 workflow_dispatch
assert_rejected "missing event" 2

if ((failures > 0)); then
  printf '%d of %d image selector checks failed\n' "${failures}" "${checks}" >&2
  exit 1
fi

printf '%d image selector checks passed\n' "${checks}"
