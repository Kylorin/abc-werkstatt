#!/usr/bin/env bash
# Vertont feste Sätze, Geräusche, gedehnte Laute und Startwortschatz (tools/vertonen.py).
# Standard-Backend: Piper lokal (kostenlos). OpenRouter nur mit --backend openrouter --kostenpflichtig,
# Schlüssel dann aus der Umgebung OPENROUTER_API_KEY (wird nie ausgegeben).
#
# Aufruf:
#   bash tools/vertonen.sh --einrichten         Piper-venv + Stimme de_DE-thorsten-high nach tools/.lokal/piper
#   bash tools/vertonen.sh [--neu] [--nur PRAEFIX] [--nur-manifest]
# In einem Worktree (.wt/<name>) wird das Piper des Haupt-Checkouts benutzt.
set -euo pipefail
HIER="$(cd "$(dirname "$0")" && pwd)"
PIPER="${PIPER_DIR:-$HIER/.lokal/piper}"
if [ ! -d "$PIPER" ] && [ -z "${PIPER_DIR:-}" ]; then
  HAUPT="$(cd "$(git -C "$HIER" rev-parse --path-format=absolute --git-common-dir)/.." && pwd)"
  [ -d "$HAUPT/tools/.lokal/piper" ] && PIPER="$HAUPT/tools/.lokal/piper"
fi
STIMME=de_DE-thorsten-high
QUELLE=https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high

if [ "${1:-}" = "--einrichten" ]; then
  mkdir -p "$PIPER/stimmen"
  [ -d "$PIPER/venv" ] || uv venv "$PIPER/venv" --python 3.12
  if [ -x "$PIPER/venv/Scripts/python.exe" ]; then PY="$PIPER/venv/Scripts/python.exe"; else PY="$PIPER/venv/bin/python"; fi
  uv pip install --python "$PY" piper-tts
  for d in "$STIMME.onnx.json" "$STIMME.onnx"; do
    [ -s "$PIPER/stimmen/$d" ] || curl -fsSL -o "$PIPER/stimmen/$d" "$QUELLE/$d"
  done
  echo "Piper eingerichtet unter $PIPER"
  exit 0
fi

if [ -x "$PIPER/venv/Scripts/python.exe" ]; then PY="$PIPER/venv/Scripts/python.exe"
elif [ -x "$PIPER/venv/bin/python" ]; then PY="$PIPER/venv/bin/python"
else echo "Piper-venv fehlt — erst: bash tools/vertonen.sh --einrichten" >&2; exit 2; fi
command -v ffmpeg >/dev/null || { echo "ffmpeg fehlt im PATH" >&2; exit 2; }
export PIPER_DIR="$PIPER" PYTHONIOENCODING=utf-8
exec "$PY" "$HIER/vertonen.py" "$@"
