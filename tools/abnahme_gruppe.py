"""RICHTER — nachts schreibgeschützt.

Prüft im Playwright-JSON-Bericht, ob alle Tests einer describe-Gruppe grün sind.
Aufruf: python tools/abnahme_gruppe.py <ergebnis.json> "<Gruppentitel>" ["<Gruppentitel>" ...]
Exit 0 nur, wenn jede genannte Gruppe existiert, mindestens einen Test hat und alle ok sind.
"""
import json
import sys


def specs_der_gruppe(suite, titel, drin=False):
    drin = drin or suite.get("title") == titel
    gefunden = []
    if drin:
        gefunden.extend(suite.get("specs", []))
    for kind in suite.get("suites", []):
        gefunden.extend(specs_der_gruppe(kind, titel, drin))
    return gefunden


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    bericht = json.load(open(sys.argv[1], encoding="utf-8"))
    fehler = 0
    for titel in sys.argv[2:]:
        specs = [s for top in bericht.get("suites", []) for s in specs_der_gruppe(top, titel)]
        if not specs:
            print(f"ROT  {titel}: Gruppe nicht gefunden oder leer")
            fehler += 1
            continue
        rot = [s["title"] for s in specs if not s.get("ok")]
        if rot:
            fehler += 1
            print(f"ROT  {titel}: {len(rot)}/{len(specs)} fehlgeschlagen")
            for t in rot:
                print(f"     - {t}")
        else:
            print(f"GRÜN {titel}: {len(specs)} Tests")
    return 1 if fehler else 0


if __name__ == "__main__":
    sys.exit(main())
