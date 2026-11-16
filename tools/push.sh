#!/usr/bin/env bash
# Push von main als Kylorin, ohne den aktiven gh-Account zu wechseln. Nie --force.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(git rev-parse --abbrev-ref HEAD)" = "main" ] || { echo "nicht auf main"; exit 1; }
GH_TOKEN="$(gh auth token --user Kylorin)" git push origin main
