#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repository_dir="$(cd -- "${script_dir}/../../.." && pwd)"
image="mcr.microsoft.com/playwright:v1.62.1-noble@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac"

docker run --rm --init --platform linux/amd64 \
  --user "$(id -u):$(id -g)" \
  --env CI=1 \
  --env HOME=/tmp \
  --env NEXT_TELEMETRY_DISABLED=1 \
  --volume "${repository_dir}:/workspace" \
  --tmpfs /workspace/apps/web/node_modules:exec,mode=1777 \
  --tmpfs /workspace/apps/web/.next:exec,mode=1777 \
  --workdir /workspace/apps/web \
  "${image}" \
  bash -lc 'npm ci && npm run build && npm run test:visual -- --update-snapshots && npm run test:visual'
