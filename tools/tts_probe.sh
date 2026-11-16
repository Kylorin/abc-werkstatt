#!/usr/bin/env bash
# Trockenlauf: eine echte Azure-TTS-Synthese (Laut per IPA + ein Wort). Kosten < 0,01 €.
# Aufruf: tools/tts_probe.sh <zielordner>
set -euo pipefail
[ -f "$(dirname "$0")/.lokal/schluessel.sh" ] && . "$(dirname "$0")/.lokal/schluessel.sh"
ZIEL="${1:?Zielordner fehlt}"
: "${AZURE_SPEECH_KEY:?}"; KEY="$AZURE_SPEECH_KEY"
: "${AZURE_SPEECH_REGION:?}"; REGION="$AZURE_SPEECH_REGION"
synth() { # $1 datei, $2 ssml-body
  local code
  code="$(curl -s -o "$ZIEL/$1" -w '%{http_code}' -X POST "https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1" \
    -H "Ocp-Apim-Subscription-Key: ${KEY}" -H "Content-Type: application/ssml+xml" \
    -H "X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3" -H "User-Agent: abc-werkstatt" \
    --data-binary "<speak version='1.0' xml:lang='de-DE' xmlns='http://www.w3.org/2001/10/synthesis'><voice name='${VOICE:-de-DE-KatjaNeural}'>$2</voice></speak>")"
  echo "$1: HTTP $code, $(wc -c < "$ZIEL/$1") Bytes"
  [ "$code" = "200" ]
}

synth wort_mama.mp3 "Mama"
synth laut_b.mp3 "<phoneme alphabet='ipa' ph='b'>b</phoneme>"
synth laut_m.mp3 "<phoneme alphabet='ipa' ph='mː'>m</phoneme>"

