#!/usr/bin/env bash
set -euo pipefail

if (($# == 0)); then
  echo "usage: select-images.sh EVENT_NAME [CHANGED_PATH ...]" >&2
  exit 2
fi

event_name="$1"
shift

api=false
web=false

case "${event_name}" in
  push)
    api=true
    web=true
    ;;
  pull_request)
    for path in "$@"; do
      case "${path}" in
        .dockerignore | .github/workflows/images.yml | .github/scripts/select-images.sh)
          api=true
          web=true
          ;;
        apps/api/api/openapi.yaml)
          api=true
          web=true
          ;;
        apps/api/*)
          api=true
          ;;
        apps/web/* | content/*)
          web=true
          ;;
      esac
    done
    ;;
  *)
    printf 'unsupported image workflow event: %s\n' "${event_name}" >&2
    exit 2
    ;;
esac

if [[ "${api}" == true && "${web}" == true ]]; then
  printf '%s\n' '["api","web"]'
elif [[ "${api}" == true ]]; then
  printf '%s\n' '["api"]'
elif [[ "${web}" == true ]]; then
  printf '%s\n' '["web"]'
else
  echo "no runtime image selected" >&2
  exit 1
fi
