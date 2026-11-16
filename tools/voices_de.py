"""Listet die deutschen Stimmen aus einer Azure-Speech-Stimmenliste (JSON-Datei)."""
import json
import sys

voices = json.load(open(sys.argv[1], encoding="utf-8"))
de = [v["ShortName"] for v in voices if v["Locale"] == "de-DE"]
print(len(voices), "Stimmen;", " ".join(de))
