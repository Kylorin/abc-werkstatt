#!/usr/bin/env bash
# Trockenlauf: darf dieses Repo als Kylorin nach origin/main pushen? (dry-run, schreibt nichts)
set -euo pipefail
cd "$(dirname "$0")/.."
[ "$(git config --local user.name)" = "Kylorin" ] || { echo "lokale Identity ist nicht Kylorin"; exit 1; }
gh auth token --user Kylorin >/dev/null || { echo "kein gh-Token für Kylorin hinterlegt"; exit 1; }
GH_TOKEN="$(gh auth token --user Kylorin)" git push --dry-run origin HEAD:main
echo "Push-Trockenlauf ok"
