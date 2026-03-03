#!/usr/bin/env bash
# Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.
# SHIELD® — Structured Website Security & Resilience Assessment Framework
# This file is part of SHIELD Scanner and is subject to the terms of the
# All Rights Reserved license included in the LICENSE file.

set -euo pipefail

IMAGE="${1:?image required}"
TARGET_URL="${2:?target_url required}"
MODE="${3:-posture}"
PROFILE="${4:-standard}"
AUTH_FILE_PATH="${5:-}"

mkdir -p output

echo "== SHIELD Scanner =="
echo "Image: ${IMAGE}"
echo "Target: ${TARGET_URL}"
echo "Mode: ${MODE}"
echo "Profile: ${PROFILE}"

# Optional GHCR login (if secrets are set by workflow)
if [[ -n "${GHCR_USERNAME:-}" && -n "${GHCR_TOKEN:-}" ]]; then
  echo "Logging into GHCR..."
  echo "${GHCR_TOKEN}" | docker login ghcr.io -u "${GHCR_USERNAME}" --password-stdin
fi

# Build args
ARGS=( "${TARGET_URL}" "--mode" "${MODE}" "--profile" "${PROFILE}" )

if [[ "${MODE}" == "authorized" ]]; then
  if [[ -z "${AUTH_FILE_PATH}" ]]; then
    echo "ERROR: authorized mode requires auth_file_path"
    exit 2
  fi
  ARGS+=( "--i-accept-risk" "--authorization-ref" "/work/${AUTH_FILE_PATH}" )
fi

echo "Running container..."
# Assumption: image contains run_all.sh at /usr/bin/run_all.sh and writes output into /work/output
docker run --rm   -v "${GITHUB_WORKSPACE:-$(pwd)}:/work"   -w /work   "${IMAGE}"   bash -lc "/usr/bin/run_all.sh ${ARGS[*]}"

echo "Container finished."
echo "Expected outputs:"
ls -la output || true
