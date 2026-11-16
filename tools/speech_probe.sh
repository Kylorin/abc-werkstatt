#!/usr/bin/env bash
# Kostenloser Trockenlauf: kann der Foundry-Key Azure Speech? Ruft nur die Stimmenliste ab.
# Gibt nie Schlüsselwerte aus.
set -euo pipefail
export MSYS_NO_PATHCONV=1
COS="C:/Users/neura/Documents/Repositories/chief-of-staff/scripts"
PROJ="e4b5a9e9-758c-4e90-93ec-c172aee3314e"
KEY="$(python "$COS/infisical_get_secret.py" "$PROJ" /azure-ai-foundry AZURE_AI_FOUNDRY_API_KEY | tr -d '\r\n')"
REGION="$(python "$COS/infisical_get_secret.py" "$PROJ" /azure-ai-foundry AZURE_AI_FOUNDRY_REGION | tr -d '\r\n')"
echo "Region: $REGION"
OUT="$(mktemp)"
CODE="$(curl -s -o "$OUT" -w '%{http_code}' "https://${REGION}.tts.speech.microsoft.com/cognitiveservices/voices/list" -H "Ocp-Apim-Subscription-Key: ${KEY}")"
echo "HTTP $CODE"
if [ "$CODE" != "200" ]; then head -c 300 "$OUT"; echo; rm -f "$OUT"; exit 1; fi
python "$(dirname "$0")/voices_de.py" "$OUT"
rm -f "$OUT"
