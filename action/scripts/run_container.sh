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

# Build args for SHIELD Framework CLI
ARGS=()
ARGS+=( "--mode" "${MODE}" )

# Map profile to rate-aware mode if needed
if [[ "${PROFILE}" == "quick" ]]; then
  ARGS+=( "-t" "5" )
elif [[ "${PROFILE}" == "deep" ]]; then
  ARGS+=( "--rate-aware" )
fi

if [[ "${MODE}" == "authorized" ]]; then
  if [[ -z "${AUTH_FILE_PATH}" ]]; then
    echo "ERROR: authorized mode requires auth_file_path"
    exit 2
  fi
  ARGS+=( "--i-accept-risk" "--authorization-ref" "/work/${AUTH_FILE_PATH}" )
fi

# Add target URL as last argument
ARGS+=( "${TARGET_URL}" )

echo "Running container..."
docker run --rm \
  -v "${GITHUB_WORKSPACE:-$(pwd)}:/work" \
  -v "${GITHUB_WORKSPACE:-$(pwd)}/output:/app/output" \
  -w /work \
  "${IMAGE}" \
  "${ARGS[@]}"

echo "Container finished."
echo ""
echo "Verifying outputs..."

# Verify expected outputs exist
if [[ ! -f "output/report.json" ]]; then
  echo "ERROR: output/report.json not found"
  exit 1
fi

if [[ ! -f "output/report.md" ]]; then
  echo "ERROR: output/report.md not found"
  exit 1
fi

echo "✓ output/report.json ($(wc -l < output/report.json) lines)"
echo "✓ output/report.md ($(wc -l < output/report.md) lines)"
echo ""
echo "Scan completed successfully!"