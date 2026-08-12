#!/usr/bin/env bash

set -euo pipefail

if [[ "$#" -ne 2 ]]; then
  echo "usage: $0 LOCAL_IMAGE REMOTE_IMAGE" >&2
  exit 2
fi

local_image="$1"
remote_image="$2"

if inspect_output="$(docker buildx imagetools inspect "${remote_image}" 2>&1)"; then
  docker pull "${remote_image}" >/dev/null
  local_id="$(docker image inspect "${local_image}" --format '{{.Id}}')"
  remote_id="$(docker image inspect "${remote_image}" --format '{{.Id}}')"
  if [[ "${local_id}" != "${remote_id}" ]]; then
    echo "Refusing to overwrite immutable image ${remote_image}" >&2
    exit 1
  fi
  echo "Reusing immutable image ${remote_image}"
  exit 0
fi

if ! grep -Eqi 'manifest unknown|not found|no such manifest' <<<"${inspect_output}"; then
  echo "Could not determine whether ${remote_image} already exists" >&2
  echo "${inspect_output}" >&2
  exit 1
fi

docker tag "${local_image}" "${remote_image}"
docker push "${remote_image}"
docker buildx imagetools inspect "${remote_image}" >/dev/null
