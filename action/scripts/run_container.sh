#!/usr/bin/env bash
# Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.
# SHIELD® — Structured Website Security & Resilience Assessment Framework
# This file is part of SHIELD Scanner and is subject to the terms of the
# All Rights Reserved license included in the LICENSE file.

set -euo pipefail

TARGET_URL="${1:?target_url required}"
MODE="${2:-posture}"
PROFILE="${3:-standard}"
AUTH_FILE_PATH="${4:-}"

FRAMEWORK_DIR="shield-framework"
OUTPUT_DIR="$(pwd)/output"

mkdir -p "${OUTPUT_DIR}"

echo "== SHIELD Scanner =="
echo "Target: ${TARGET_URL}"
echo "Mode: ${MODE}"
echo "Profile: ${PROFILE}"

# Clone SHIELD Framework
if [[ -d "${FRAMEWORK_DIR}" ]]; then
  echo "Removing existing framework directory..."
  rm -rf "${FRAMEWORK_DIR}"
fi

echo "Cloning SHIELD Framework..."
git clone --depth 1 https://github.com/Georges034302/SHIELD-framework.git "${FRAMEWORK_DIR}"

# Build args for SHIELD Framework CLI
ARGS=()
ARGS+=( "--mode" "${MODE}" )

# Map profile to framework options
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
  ARGS+=( "--i-accept-risk" "--authorization-ref" "${AUTH_FILE_PATH}" )
fi

# Add output directory and target URL
ARGS+=( "-o" "${OUTPUT_DIR}" )
ARGS+=( "${TARGET_URL}" )

echo "Running SHIELD Framework..."
cd "${FRAMEWORK_DIR}"
bash scripts/run_all.sh "${ARGS[@]}"

cd - > /dev/null

echo ""
echo "Consolidating outputs..."

# Consolidate step*/json files into report.json
jq -s '
{
  meta: {
    timestamp: ((.[0].timestamp // now) | todate),
    target: (.[0].scope.target // "unknown"),
    mode: (.[0].scope.mode // "posture"),
    grade: "Pending"
  },
  findings: [.[] | .checks[]? // empty]
}' "${OUTPUT_DIR}"/step*/*.json > "${OUTPUT_DIR}/report.json.tmp"

# Calculate grade based on severity counts
CRITICAL=$(jq '[.findings[] | select(.severity=="critical")] | length' "${OUTPUT_DIR}/report.json.tmp")
HIGH=$(jq '[.findings[] | select(.severity=="high")] | length' "${OUTPUT_DIR}/report.json.tmp")
MEDIUM=$(jq '[.findings[] | select(.severity=="medium")] | length' "${OUTPUT_DIR}/report.json.tmp")

GRADE="A"
if [[ ${CRITICAL} -gt 0 ]]; then
  GRADE="F"
elif [[ ${HIGH} -gt 3 ]]; then
  GRADE="D"
elif [[ ${HIGH} -gt 0 ]]; then
  GRADE="C"
elif [[ ${MEDIUM} -gt 5 ]]; then
  GRADE="B"
fi

# Update grade in report.json
jq --arg grade "${GRADE}" '.meta.grade = $grade' "${OUTPUT_DIR}/report.json.tmp" > "${OUTPUT_DIR}/report.json"
rm "${OUTPUT_DIR}/report.json.tmp"

echo ""
echo "Verifying outputs..."

# Verify expected outputs exist
if [[ ! -f "${OUTPUT_DIR}/report.json" ]]; then
  echo "ERROR: output/report.json not found"
  exit 1
fi

if [[ ! -f "${OUTPUT_DIR}/report.md" ]]; then
  echo "ERROR: output/report.md not found"
  exit 1
fi

echo "✓ output/report.json ($(wc -l < "${OUTPUT_DIR}/report.json") lines)"
echo "✓ output/report.md ($(wc -l < "${OUTPUT_DIR}/report.md") lines)"
echo "✓ Grade: ${GRADE}"
echo ""
echo "Scan completed successfully!"