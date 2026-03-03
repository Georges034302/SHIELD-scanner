#!/usr/bin/env bash
# Copyright © 2026 Georges Bou Ghantous. All Rights Reserved.
# SHIELD® — Structured Website Security & Resilience Assessment Framework
# This file is part of SHIELD Scanner and is subject to the terms of the
# All Rights Reserved license included in the LICENSE file.

set -euo pipefail

if [[ ! -f "output/report.json" ]]; then
  echo "ERROR: output/report.json not found. Cannot render HTML."
  exit 2
fi

node render/html_from_json.js output/report.json output/report.html render/template.html

echo "Rendered output/report.html"
