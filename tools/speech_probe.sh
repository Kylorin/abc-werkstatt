#!/usr/bin/env bash
# Kostenloser Trockenlauf: kann der Foundry-Key Azure Speech? Ruft nur die Stimmenliste ab.
# Gibt nie Schlüsselwerte aus.
set -euo pipefail
[ -f "$(dirname "$0")/.lokal/schluessel.sh" ] && . "$(dirname "$0")/.lokal/schluessel.sh"
: "${AZURE_SPEECH_KEY:?}"; KEY="$AZURE_SPEECH_KEY"
: "${AZURE_SPEECH_REGION:?}"; REGION="$AZURE_SPEECH_REGION"
echo "Region: $REGION"
OUT="$(mktemp)"
CODE="$(curl -s -o "$OUT" -w '%{http_code}' "https://${REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list" -H "Ocp-Apim-Subscription-Key: ${KEY}")"
echo "HTTP $CODE"
if [ "$CODE" != "200" ]; then head -c 300 "$OUT"; echo; rm -f "$OUT"; exit 1; fi
python "$(dirname "$0")/voices_de.py" "$OUT"
rm -f "$OUT"
