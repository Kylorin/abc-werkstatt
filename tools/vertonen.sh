#!/usr/bin/env bash
# Vertont den Audio-Bestand (public/audio) über Azure Speech. Kosten: Cent-Beträge.
# Schlüssel/Region aus tools/.lokal/schluessel.sh (gitignored). Gibt nie Schlüsselwerte aus.
# Aufruf: bash tools/vertonen.sh [--neu] [--nur-manifest]
set -euo pipefail
HIER="$(cd "$(dirname "$0")" && (pwd -W 2>/dev/null || pwd))"
LOKAL="$HIER/.lokal/schluessel.sh"
# Worktrees (.wt/<name>) teilen die Schlüsseldatei des Haupt-Checkouts.
[ -f "$LOKAL" ] || LOKAL="$(git -C "$HIER" rev-parse --path-format=absolute --git-common-dir)/../tools/.lokal/schluessel.sh"
for a in "$@"; do [ "$a" = "--nur-manifest" ] && LOKAL=""; done
if [ -n "$LOKAL" ]; then
  [ -f "$LOKAL" ] || { echo "Schlüsseldatei fehlt: tools/.lokal/schluessel.sh" >&2; exit 2; }
  . "$LOKAL"
fi
PY="${PYTHON:-python}"
exec "$PY" "$HIER/vertonen.py" "$@"
