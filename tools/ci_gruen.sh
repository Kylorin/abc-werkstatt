#!/usr/bin/env bash
# RICHTER — nachts schreibgeschützt.
# Aufruf:
#   tools/ci_gruen.sh                      -> ganzer CI-Lauf für HEAD grün UND Pages liefert 200
#   tools/ci_gruen.sh "Gruppe" ["Gruppe"]  -> nur diese Abnahme-Gruppen im CI-Lauf für HEAD grün
# Voraussetzung: HEAD ist auf origin/main gepusht. Wartet bis zu 25 min auf den Lauf.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO="Kylorin/abc-werkstatt"
TOKEN="$(gh auth token --user Kylorin)"
git fetch -q origin main
SHA="$(git rev-parse HEAD)"
if [ "$SHA" != "$(git rev-parse origin/main)" ]; then
  echo "HEAD $SHA ist nicht auf origin/main gepusht"; exit 1
fi
ID=""; CONCL=""
for _ in $(seq 1 100); do
  ZEILE="$(GH_TOKEN="$TOKEN" gh run list -R "$REPO" --workflow ci.yml --commit "$SHA" -L 1 \
    --json status,conclusion,databaseId --jq '.[0] | "\(.status) \(.conclusion) \(.databaseId)"' 2>/dev/null || true)"
  if [ "${ZEILE%% *}" = "completed" ]; then read -r _ CONCL ID <<<"$ZEILE"; break; fi
  sleep 15
done
[ -n "$ID" ] || { echo "Zeitüberschreitung: kein abgeschlossener CI-Lauf für $SHA"; exit 1; }
echo "CI-Lauf $ID für $SHA: $CONCL"

if [ "$#" -gt 0 ]; then
  TMP="$(mktemp -d)"
  GH_TOKEN="$TOKEN" gh run download "$ID" -R "$REPO" -n abnahme-ergebnis -D "$TMP" \
    || { echo "kein Abnahme-Ergebnis im Lauf $ID (Build gescheitert?)"; GH_TOKEN="$TOKEN" gh run view "$ID" -R "$REPO" --log-failed 2>/dev/null | tail -40; exit 1; }
  python "tools/abnahme_gruppe.py" "$TMP/ergebnis.json" "$@"
  exit $?
fi

if [ "$CONCL" != "success" ]; then
  GH_TOKEN="$TOKEN" gh run view "$ID" -R "$REPO" --log-failed 2>/dev/null | tail -40 || true
  exit 1
fi
CODE="$(curl -s -o /dev/null -w '%{http_code}' https://kylorin.github.io/abc-werkstatt/)"
echo "Pages: HTTP $CODE"
[ "$CODE" = "200" ]
