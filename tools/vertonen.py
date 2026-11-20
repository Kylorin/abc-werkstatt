"""Vertont Wörter und Sätze der ABC-Werkstatt über Azure Speech (REST, SSML).

Erzeugt unter public/audio/:
  woerter/<slug>.mp3            Startwortschatz
  saetze/<slug>.mp3             kurze Lob-Sätze ohne Wort
  manifest.json                 Pfade RELATIV zur App-Basis (z. B. "audio/woerter/oma.mp3")

Laute (laute/<slug>-ki1.mp3, -ki2.mp3) und Buchstabennamen (namen/<slug>.mp3) kommen NICHT von hier,
sondern aus tools/laute_ki.py (Sprachmodell + Hör-Bewertung). Dieses Skript fasst sie nie an: Es
übernimmt die Einträge laute/namen/varianten unverändert aus dem vorhandenen manifest.json und prüft
nur, dass die Dateien da sind.

Schlüssel und Region kommen aus der Umgebung (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION),
gesetzt von tools/vertonen.sh. Der Schlüssel wird nie ausgegeben.

Aufruf:  bash tools/vertonen.sh [--neu] [--nur-manifest]
  --neu            vorhandene Dateien neu erzeugen (sonst werden sie übersprungen)
  --nur-manifest   keine Synthese, nur manifest.json aus dem Bestand schreiben
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

WURZEL = Path(__file__).resolve().parent.parent
ZIEL = WURZEL / "public" / "audio"
FORMAT = "audio-24khz-48kbitrate-mono-mp3"
MIN_BYTES = 1024

# Stimme: KEINE *MultilingualNeural-Stimmen, die ignorieren <phoneme>.
KATJA = "de-DE-KatjaNeural"

LAUTE = list("abcdefghijklmnopqrstuvwxyz") + ["ä", "ö", "ü", "ß"]
# Diese Manifest-Teile gehören tools/laute_ki.py und werden hier nur übernommen.
FREMD = ("laute", "namen", "varianten")
SLUG = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "sz"}


def slug(text: str) -> str:
    """ASCII-sicherer Dateiname (Umlaute umschreiben, nur a–z0–9 und -)."""
    aus = "".join(SLUG.get(z, z) for z in text.lower())
    if not aus or any(not (z.isascii() and (z.isalnum() or z == "-")) for z in aus):
        raise ValueError(f"Kein ASCII-sicherer Dateiname für {text!r}: {aus!r}")
    return aus


# Startwortschatz: STARTWOERTER aus src/kern/woerter.ts (lautgetreu) plus die Wörter der ersten
# Startliste (bleiben vertont, weil sie auf älteren Geräten noch im Wörterbuch stehen). Kanonisch klein.
WOERTER = [
    "mama", "papa", "oma", "opa", "ball", "hund", "katze", "maus", "igel", "hase",
    "sonne", "mond", "baum", "haus", "auto", "nase", "hand", "fisch", "ente", "kuh",
    "eis", "ei", "bär", "löwe", "käse", "tür", "apfel", "brot", "milch", "buch",
    "sofa", "rad", "tomate", "lama", "hut",
    "limo", "kino", "uhu", "ufo", "mofa", "hose", "rose", "dose", "ofen", "rabe",
]
# So spricht die Engine sie: Nomen mit großem Anfangsbuchstaben, NIE ganz groß (sonst buchstabiert sie).
WORT_ANZEIGE = {w: w[:1].upper() + w[1:] for w in WOERTER}

SAETZE = ["Fertig!", "Wunderbar.", "Das hast du geschrieben.", "Schön gemacht."]


@dataclass(frozen=True)
class Auftrag:
    datei: Path
    stimme: str
    body: str  # SSML-Inhalt innerhalb von <voice>


def ssml(stimme: str, body: str) -> bytes:
    return (
        "<speak version=\"1.0\" xml:lang=\"de-DE\" xmlns=\"http://www.w3.org/2001/10/synthesis\">"
        f"<voice name={quoteattr(stimme)}>{body}</voice></speak>"
    ).encode("utf-8")


def auftraege() -> tuple[list[Auftrag], dict]:
    jobs: list[Auftrag] = []
    vorhanden = json.loads((ZIEL / "manifest.json").read_text(encoding="utf-8"))
    manifest: dict = {"laute": {}, "namen": {}, "woerter": {}, "saetze": {}, "varianten": {}}
    for teil in FREMD:
        if set(vorhanden.get(teil, {})) != set(LAUTE):
            raise RuntimeError(f"manifest.json: Teil {teil!r} deckt nicht alle Buchstaben ab "
                               "(kommt aus tools/laute_ki.py, nicht von hier)")
        manifest[teil] = vorhanden[teil]

    for w in WOERTER:
        s = slug(w)
        jobs.append(Auftrag(ZIEL / "woerter" / f"{s}.mp3", KATJA, escape(WORT_ANZEIGE[w])))
        manifest["woerter"][w] = f"audio/woerter/{s}.mp3"

    for satz in SAETZE:
        s = slug("-".join("".join(z for z in wort if z.isalnum()) for wort in satz.split()))
        body = f"<prosody rate=\"-10%\">{escape(satz)}</prosody>"
        jobs.append(Auftrag(ZIEL / "saetze" / f"{s}.mp3", KATJA, body))
        manifest["saetze"][satz] = f"audio/saetze/{s}.mp3"

    return jobs, manifest


def synthetisiere(job: Auftrag, region: str, schluessel: str) -> bytes:
    url = f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"
    daten = ssml(job.stimme, job.body)
    for versuch in range(5):
        req = urllib.request.Request(url, data=daten, method="POST", headers={
            "Ocp-Apim-Subscription-Key": schluessel,
            "Content-Type": "application/ssml+xml; charset=utf-8",
            "X-Microsoft-OutputFormat": FORMAT,
            "User-Agent": "abc-werkstatt-vertonen",
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as antwort:
                return antwort.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and versuch < 4:
                time.sleep(2 ** versuch)
                continue
            text = e.read()[:300].decode("utf-8", "replace")
            raise RuntimeError(f"Azure HTTP {e.code} für {job.datei.name}: {text}") from None
    raise RuntimeError(f"Azure drosselt dauerhaft (429) bei {job.datei.name}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--neu", action="store_true", help="vorhandene Dateien neu erzeugen")
    ap.add_argument("--nur-manifest", action="store_true", help="nur manifest.json schreiben")
    ap.add_argument("--nur", metavar="PRAEFIX", help="nur Dateien, deren Pfad unter audio/ so beginnt (z. B. woerter/o)")
    args = ap.parse_args()

    jobs, manifest = auftraege()

    if not args.nur_manifest:
        schluessel = os.environ.get("AZURE_SPEECH_KEY", "")
        region = os.environ.get("AZURE_SPEECH_REGION", "")
        if not schluessel or not region:
            print("AZURE_SPEECH_KEY/AZURE_SPEECH_REGION fehlen (tools/vertonen.sh benutzen).", file=sys.stderr)
            return 2
        neu = uebersprungen = 0
        for job in jobs:
            if args.nur and not job.datei.relative_to(ZIEL).as_posix().startswith(args.nur):
                continue
            if job.datei.exists() and not args.neu:
                uebersprungen += 1
                continue
            job.datei.parent.mkdir(parents=True, exist_ok=True)
            daten = synthetisiere(job, region, schluessel)
            if len(daten) <= MIN_BYTES:
                raise RuntimeError(f"{job.datei.name}: nur {len(daten)} Bytes — Synthese verdächtig leer")
            job.datei.write_bytes(daten)
            neu += 1
            print(f"  {job.datei.relative_to(ZIEL).as_posix()}  {len(daten)} B")
        print(f"neu: {neu}, übersprungen: {uebersprungen}")

    # Bestand prüfen: jede Datei im Manifest existiert und ist > 1 KB (auch die übernommenen Laute/Namen).
    fehler = []
    pfade = [job.datei for job in jobs]
    pfade += [ZIEL.parent / manifest[t][b] for t in ("laute", "namen") for b in LAUTE]
    pfade += [ZIEL.parent / v["url"] for b in LAUTE for v in manifest["varianten"][b]]
    for p in pfade:
        if not p.exists():
            fehler.append(f"fehlt: {p.relative_to(ZIEL).as_posix()}")
        elif p.stat().st_size <= MIN_BYTES:
            fehler.append(f"zu klein: {p.relative_to(ZIEL).as_posix()}")
    if fehler:
        print("\n".join(fehler), file=sys.stderr)
        return 1

    (ZIEL / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"manifest.json: {len(manifest['laute'])} Laute, {len(manifest['woerter'])} Wörter, "
          f"{sum(len(v) for v in manifest['varianten'].values())} Varianten, {len(manifest['saetze'])} Sätze")
    return 0


if __name__ == "__main__":
    sys.exit(main())
