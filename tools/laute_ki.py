"""Erzeugt die Laute der ABC-Werkstatt mit einem Sprachmodell und lässt sie von Hör-Modellen bewerten.

Ablauf je Buchstabe (alles über die OpenRouter-API):
  erzeugen        N Kandidaten über ein Audio-Ausgabe-Modell (Standard openai/gpt-audio), wechselnde
                  Stimmen und leicht variierte Anweisungen; Rohdaten als WAV + Antwort-JSON. Vokale,
                  Plosive und Lautfolgen werden dreimal gesprochen (einzeln bleibt das Modell oft stumm).
  nachbearbeiten  Stumme Aufnahmen aussortieren, Stille vorn/hinten abschneiden (bei dreimal
                  Gesprochenem den kräftigsten Abschnitt nehmen), Dauerlaute/Plosive auf Höchstlänge
                  kappen, 15 ms Fade-in / 30 ms Fade-out, Lautheit auf ca. -16 LUFS (begrenzt durch
                  -1,5 dBTP Spitze), MP3 mono 24 kHz 64 kbit/s; Dauer messen.
  bewerten        Jeder Bewerter (Modelle mit Audio-Eingang) hört den bearbeiteten Laut zweistufig:
                  erst blind „was ist zu hören", dann gegen die Vorgabe mit Noten als JSON.
  auswaehlen      Gesamtwert = Mittel der Bewerter-Noten, harte Ausschlüsse (Vokal angehängt, falscher
                  Laut, nicht nur der Laut – jeweils per Bewerter-Mehrheit; Dauer außerhalb der
                  Lautklasse; Transkript ≠ Sprechform); die besten 2 je Buchstabe (s: je Variante 1).
                  Bewertungstabelle (CSV + JSON), Auswahl-Kopien unter auswahl/ und eine Hörseite
                  hoeren.html.
  alles           erzeugen → nachbearbeiten → bewerten → auswaehlen; liegt der Beste eines Buchstabens
                  unter der Schwelle (Standard 7), folgt ein Nachlauf mit geschärfter Anweisung aus den
                  Bewerter-Begründungen, bis zu 3 Runden insgesamt.

Alle Rohdaten liegen unter tools/.lokal/laute-roh/<lauf>/ (gitignored). Jeder Schritt ist idempotent:
Vorhandenes wird übersprungen; Fehler einzelner Anfragen werden gemeldet, der Lauf endet dann mit
Exit 1, und ein erneuter Aufruf holt nur das Fehlende nach. Der Schlüssel OPENROUTER_API_KEY kommt
aus der gitignorierten .env im Repo-Wurzelordner (Vorrang) oder aus der Umgebung und wird nie
ausgegeben.

Aufruf (Python 3.10+, numpy, ffmpeg/ffprobe im PATH):
  python tools/laute_ki.py alles --lauf haupt
  python tools/laute_ki.py erzeugen --lauf probe --nur m,b,k,a --anzahl 6
  python tools/laute_ki.py nachbearbeiten --lauf probe
  python tools/laute_ki.py bewerten --lauf probe
  python tools/laute_ki.py auswaehlen --lauf probe
"""

from __future__ import annotations

import argparse
import base64
import csv
import html
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import wave
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

WURZEL = Path(__file__).resolve().parent.parent
ROH = WURZEL / "tools" / ".lokal" / "laute-roh"
API = "https://openrouter.ai/api/v1/chat/completions"

ERZEUGER = "openai/gpt-audio"
# Von der API angenommene, warme Stimmen (erprobt). Reihenfolge = Rotation über die Kandidaten.
STIMMEN = ["shimmer", "coral", "sage", "marin"]
# Bewerter (erprobt an m, b, k, a): Gemini 4 Argon ist das stärkste Hör-Modell und am beständigsten.
# Gemini 3.8 Flash stimmt meist mit Argon überein, halluziniert aber vereinzelt (hört [uː] in einem k);
# MiMo (Xiaomi, unabhängiger Hersteller) hört lange Vokale und Schwa genau, kurze stimmlose Plosive aber
# oft als [p]/[t]/Klick und lehnt ~5 % der Anfragen ab (Inhaltsfilter, leere Antwort). Drei Bewerter mit
# Mehrheitsregel gleichen die Einzelschwächen aus. Ungeeignet: gpt-audio (leere Antworten bei kurzen
# Lauten), Voxtral/Qwen-Omni (überhören Schwa), Gemini 4 Carbon (urteilt wie Argon, keine 2. Meinung).
BEWERTER = ["google/gemini-4-argon", "google/gemini-3.8-flash", "xiaomi/mimo-v2.6-pro"]
MIN_BEWERTER = 2  # so viele Bewertungen braucht ein Kandidat mindestens, um wählbar zu sein
RATE = 24000
SCHWELLE = 7.0
MAX_RUNDEN = 3
SLUG = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "sz"}


# ---------------------------------------------------------------- Lautvorgabe


@dataclass(frozen=True)
class Klasse:
    name: str
    min_s: float  # Dauer des hörbaren Lauts (ohne Stille), Grenzen für den harten Ausschluss
    max_s: float
    vokal_verboten: bool
    dauer_text: str
    # Laut dreimal mit Pause sprechen lassen: einzeln gesprochen bleibt gpt-audio bei Vokalen und Plosiven
    # meist stumm (erprobt: a 5 von 6, b/k 11 von 12 stumm), dreimal fast immer hörbar. Genommen wird
    # der lauteste der Abschnitte.
    wiederholen: bool = False
    hinweis: str = ""  # Zusatz für den Bewerter


KLASSEN = {
    "dauer": Klasse("Dauerlaut", 0.55, 1.7, True, "gedehnt, etwa 0,8 bis 1,2 Sekunden"),
    # Stimmhafte Plosive (b d g): ein isoliert gesprochenes [b] ohne jede Vokalöffnung gibt es akustisch
    # kaum – Bewerter hören entweder [bə] oder (gekürzt) [p]/[m] (erprobt mit Kappen 0,07–0,18 s). Die
    # Bewerter werden deshalb angewiesen, einen kaum hörbaren Murmel-Ausklang zu dulden; ein deutliches
    # „e“/„ə“ oder der Buchstabenname bleibt Ausschluss.
    "plosiv_sth": Klasse("stimmhafter Verschlusslaut", 0.03, 0.45, True, "ganz kurz, höchstens etwa 0,3 Sekunden Ton",
                         True, "Bei stimmhaften Verschlusslauten ist ein ganz kurzer, kaum hörbarer Murmel-Ausklang "
                         "beim Lösen unvermeidlich und zulässig (dann angehaengterVokal=false, korrekt nach dem "
                         "Konsonanten beurteilen); ein deutlich hörbares „e“ oder „ə“ oder der Buchstabenname ist "
                         "es nicht."),
    "plosiv": Klasse("Verschlusslaut", 0.03, 0.45, True, "ganz kurz, höchstens etwa 0,3 Sekunden Ton", True),
    "folge": Klasse("Lautfolge", 0.10, 0.9, True, "kurz, etwa 0,2 bis 0,6 Sekunden", True),
    "hauch": Klasse("Hauchlaut", 0.15, 1.0, True, "ein kurzer, gehauchter Atemstoß, etwa 0,3 bis 0,6 Sekunden", True),
    "vokal": Klasse("Vokal", 0.25, 1.1, False, "klar und kurz gehalten, etwa 0,4 bis 0,7 Sekunden", True),
}


@dataclass(frozen=True)
class Vorgabe:
    buchstabe: str
    id: str  # eindeutig je Buchstabe ("laut", bei s zusätzlich "scharf")
    ipa: str
    wort: str  # Beispielwort mit diesem Anlaut
    beschreibung: str
    klasse: str

    @property
    def schluessel(self) -> str:
        return f"{slug(self.buchstabe)}-{self.id}"


def slug(b: str) -> str:
    return SLUG.get(b, b)


def V(b: str, ipa: str, wort: str, beschreibung: str, klasse: str, id: str = "laut") -> Vorgabe:
    return Vorgabe(b, id, ipa, wort, beschreibung, klasse)


# Vokale: je der Anlaut eines typischen Kinderworts (a kurz wie „Affe", sonst lang wie in den
# lautgetreuen Startwörtern Esel/Igel/Oma/Uhu). s: Standard summend [z] wie „Sonne", zweite
# Variante stimmlos [s].
VORGABEN: list[Vorgabe] = [
    V("a", "a", "Affe", "kurzes, offenes a wie am Anfang von „Affe“", "vokal"),
    V("b", "b", "Ball", "Lippen zu, die Stimme brummt ganz kurz hinter den geschlossenen Lippen, dann gehen die Lippen weich auf – und sofort Stille, kein „e“, kein Luftstoß", "plosiv_sth"),
    V("c", "k", "Computer", "wie k: ein kurzer, stimmloser Verschluss hinten am Gaumen, der sich löst – ohne Vokal danach", "plosiv"),
    V("d", "d", "Dose", "Zungenspitze oben hinter den Zähnen, die Stimme brummt ganz kurz, dann löst sich die Zunge weich – und sofort Stille, kein „e“, kein Luftstoß", "plosiv_sth"),
    V("e", "eː", "Esel", "langes, geschlossenes e wie am Anfang von „Esel“", "vokal"),
    V("f", "f", "Fisch", "gedehntes, stimmloses Reiben der Oberzähne an der Unterlippe: „fff“", "dauer"),
    V("g", "ɡ", "Gabel", "Zunge hinten am Gaumen, die Stimme brummt ganz kurz, dann löst sich der Verschluss weich – und sofort Stille, kein „e“, kein Luftstoß", "plosiv_sth"),
    V("h", "h", "Hase", "nur ein gehauchter Atemstoß, wie wenn man auf eine kalte Scheibe haucht – kein Vokal", "hauch"),
    V("i", "iː", "Igel", "langes, helles i wie am Anfang von „Igel“", "vokal"),
    V("j", "j", "Jojo", "gedehntes, stimmhaftes j: „jjj“ – kein „jot“, kein Vokal danach", "dauer"),
    V("k", "k", "Katze", "stimmloser Verschluss hinten am Gaumen, der sich mit leichtem Hauch löst – nur „k“, ohne Vokal", "plosiv"),
    V("l", "l", "Lama", "gedehntes, stimmhaftes l: „lll“", "dauer"),
    V("m", "m", "Mama", "gedehntes Summen mit geschlossenen Lippen: „mmm“", "dauer"),
    V("n", "n", "Nase", "gedehntes Summen durch die Nase, Zungenspitze oben: „nnn“", "dauer"),
    V("o", "oː", "Oma", "langes, rundes o wie am Anfang von „Oma“", "vokal"),
    V("p", "p", "Papa", "stimmloser Lippenverschluss, der sich mit leichtem Hauch löst – nur „p“, ohne Vokal", "plosiv"),
    V("q", "kv", "Qualle", "die Lautfolge „kw“ wie am Anfang von „Qualle“ – k, direkt danach ein kurzes w, kein Vokal", "folge"),
    V("r", "ʁ", "Rabe", "gedehntes, weiches Reibe-r hinten im Rachen: „rrr“ wie ein leises Gurren – kein Vokal", "dauer"),
    V("s", "z", "Sonne", "gedehntes, summendes s wie am Anfang von „Sonne“: „sss“ mit Stimme, wie eine Biene", "dauer"),
    V("s", "s", "Bus", "gedehntes, scharfes, stimmloses s wie am Ende von „Bus“: „sss“ wie eine Schlange", "dauer", "scharf"),
    V("t", "t", "Tomate", "stimmloser Zungenspitzenverschluss, der sich mit leichtem Hauch löst – nur „t“, ohne Vokal", "plosiv"),
    V("u", "uː", "Uhu", "langes, dunkles u wie am Anfang von „Uhu“", "vokal"),
    V("v", "f", "Vogel", "wie f: gedehntes, stimmloses „fff“ wie am Anfang von „Vogel“", "dauer"),
    V("w", "v", "Wal", "gedehntes, stimmhaftes w: „www“ – Oberzähne auf der Unterlippe, mit Stimme", "dauer"),
    V("x", "ks", "Hexe", "die Lautfolge „ks“ wie in „Hexe“ – kurzes k, direkt danach ein scharfes s, kein Vokal", "folge"),
    V("y", "y", "Typ", "wie ü: ein helles, rundes ü wie in „Typ“", "vokal"),
    V("z", "ts", "Zebra", "die Lautfolge „ts“ wie am Anfang von „Zebra“ – ein kurzes, scharfes „tss“, kein Vokal", "folge"),
    V("ä", "ɛ", "Äpfel", "kurzes, offenes ä wie am Anfang von „Äpfel“", "vokal"),
    V("ö", "øː", "Öl", "langes, rundes ö wie am Anfang von „Öl“", "vokal"),
    V("ü", "yː", "über", "langes, helles ü wie am Anfang von „über“", "vokal"),
    V("ß", "s", "Soße", "gedehntes, scharfes, stimmloses s wie in der Mitte von „Soße“: „sss“", "dauer"),
]

# Buchstabennamen (für die Einstellung „Buchstabennamen"); hier nur als Tabelle, erzeugt wird der Laut.
NAMEN = {
    "a": "A", "b": "Be", "c": "Ze", "d": "De", "e": "E", "f": "Ef", "g": "Ge", "h": "Ha", "i": "I",
    "j": "Jot", "k": "Ka", "l": "El", "m": "Em", "n": "En", "o": "O", "p": "Pe", "q": "Ku", "r": "Er",
    "s": "Es", "t": "Te", "u": "U", "v": "Fau", "w": "We", "x": "Ix", "y": "Üpsilon", "z": "Zett",
    "ä": "Ä", "ö": "Ö", "ü": "Ü", "ß": "Eszett",
}
BUCHSTABEN = list("abcdefghijklmnopqrstuvwxyz") + ["ä", "ö", "ü", "ß"]
assert {v.buchstabe for v in VORGABEN} == set(BUCHSTABEN) == set(NAMEN)


# ---------------------------------------------------------------- API


_SCHLUESSEL: list[str] = []


def schluessel() -> str:
    """Schlüssel aus der .env des Repos (hat Vorrang, weil eine global gesetzte Umgebungsvariable
    veraltet sein kann), sonst aus der Umgebung."""
    if _SCHLUESSEL:
        return _SCHLUESSEL[0]
    wert = ""
    env = WURZEL / ".env"
    if env.exists():
        for zeile in env.read_text(encoding="utf-8").splitlines():
            zeile = zeile.strip().removeprefix("export ").strip()
            if zeile.startswith("OPENROUTER_API_KEY="):
                wert = zeile.split("=", 1)[1].strip().strip("\"'")
    wert = wert or os.environ.get("OPENROUTER_API_KEY", "").strip()
    if wert:
        _SCHLUESSEL.append(wert)
    if not wert:
        raise SystemExit("OPENROUTER_API_KEY fehlt (Umgebung oder .env im Repo-Wurzelordner).")
    return wert


class ApiFehler(RuntimeError):
    pass


def anfrage(body: dict) -> urllib.request.Request:
    return urllib.request.Request(
        API,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {schluessel()}", "Content-Type": "application/json",
                 "X-Title": "ABC-Werkstatt Laute"},
    )


def oeffnen(body: dict, timeout: int = 180):
    """Öffnet die Anfrage; 429/502/503 werden zweimal mit Pause wiederholt (gemeldet), alles andere wirft."""
    for versuch in range(3):
        try:
            return urllib.request.urlopen(anfrage(body), timeout=timeout)
        except urllib.error.HTTPError as e:
            text = e.read()[:500].decode("utf-8", "replace")
            if e.code in (429, 502, 503) and versuch < 2:
                print(f"  HTTP {e.code} von {body.get('model')}, neuer Versuch in {5 * (versuch + 1)} s", file=sys.stderr)
                time.sleep(5 * (versuch + 1))
                continue
            raise ApiFehler(f"HTTP {e.code} von {body.get('model')}: {text}") from None
    raise AssertionError("unerreichbar")


# ---------------------------------------------------------------- Erzeugen

SYSTEM_ERZEUGEN = (
    "Du bist eine warme, ruhige Montessori-Erzieherin. Du sprichst einem kleinen Kind (knapp drei Jahre) "
    "einen einzelnen deutschen Laut vor – so wie im Montessori-Unterricht mit Sandpapierbuchstaben: nur "
    "den Laut selbst. Niemals den Buchstabennamen, kein Wort, kein Satz, keine Begrüßung, kein angehängter "
    "Vokal (auch kein kurzes „e“ oder „ə“). Freundlich, deutlich, entspannt, ohne Flüstern."
)

# Was das Modell als Text „sagt“. gpt-audio spricht genau seinen Antworttext: schreibt es IPA in Klammern
# („[a]“, „/b/“), bleibt das Audio stumm (erprobt: 17 von 24 Kandidaten). Deshalb steht hier eine
# sprechbare Schreibweise, und die Anweisung nennt KEINE IPA-Klammern.
SPRECHFORM = {
    "a": "a", "b": "b", "c": "k", "d": "d", "e": "ee", "f": "fff", "g": "g", "h": "hhh", "i": "ii",
    "j": "jjj", "k": "k", "l": "lll", "m": "mmm", "n": "nnn", "o": "oo", "p": "p", "q": "kw", "r": "rrr",
    "s-laut": "sss", "s-scharf": "sss", "t": "t", "u": "uu", "v": "fff", "w": "www", "x": "ks", "y": "üü",
    "z": "ts", "ä": "ä", "ö": "öö", "ü": "üü", "ß": "sss",
}


def sprechform(v: Vorgabe) -> str:
    sf = SPRECHFORM.get(f"{v.buchstabe}-{v.id}") or SPRECHFORM[v.buchstabe]
    return f"{sf} … {sf} … {sf}" if KLASSEN[v.klasse].wiederholen else sf


ANWEISUNGEN = [
    "Sprich jetzt nur den Laut des Buchstabens {b}, so wie er am Anfang von „{wort}“ klingt: {beschr}. "
    "Dauer: {dauer}. Dein Text ist genau „{sf}“ – nichts davor, nichts danach, keine Klammern.",
    "Der erste Laut in „{wort}“, ganz allein: {beschr}. {dauer_gross}. Antworte nur mit dem gesprochenen "
    "Laut, geschrieben „{sf}“.",
    "Bitte nur den reinen Laut zum Buchstaben {b} (wie im Anlaut von „{wort}“): {beschr}. Länge: {dauer}. "
    "Kein Wort, kein Name. Sprich und schreib nur „{sf}“.",
]


def lauf_dir(lauf: str) -> Path:
    return ROH / lauf


def dateien(lauf: str, muster: str) -> list[Path]:
    """Kandidaten-Dateien aller Buchstaben-Ordner (ohne den abgeleiteten Ordner auswahl/)."""
    return sorted(p for p in lauf_dir(lauf).glob(f"*/{muster}") if p.parent.name != "auswahl")


def kandidat_id(v: Vorgabe, runde: int, k: int, stimme: str) -> str:
    return f"{v.schluessel}-r{runde}-k{k:02d}-{stimme}"


def anweisung(v: Vorgabe, k: int, zusatz: str) -> str:
    dauer = KLASSEN[v.klasse].dauer_text
    text = ANWEISUNGEN[k % len(ANWEISUNGEN)].format(
        b=v.buchstabe, wort=v.wort, beschr=v.beschreibung, dauer=dauer, dauer_gross=dauer[:1].upper() + dauer[1:],
        sf=sprechform(v))
    if KLASSEN[v.klasse].wiederholen:
        text += " Sprich den Laut dreimal, mit kurzer Pause dazwischen, jedes Mal ohne Vokal danach."
    if zusatz:
        text += " Wichtig nach dem letzten Versuch: " + zusatz
    return text


def erzeuge_kandidat(ziel: Path, v: Vorgabe, stimme: str, text: str) -> None:
    body = {
        "model": ERZEUGER,
        "modalities": ["text", "audio"],
        "audio": {"voice": stimme, "format": "pcm16"},
        "stream": True,
        "usage": {"include": True},
        "messages": [{"role": "system", "content": SYSTEM_ERZEUGEN}, {"role": "user", "content": text}],
    }
    pcm, transkript, ereignisse, usage = bytearray(), [], [], None
    with oeffnen(body) as r:
        for roh in r:
            zeile = roh.decode("utf-8").strip()
            if not zeile.startswith("data: ") or zeile == "data: [DONE]":
                continue
            d = json.loads(zeile[6:])
            if "error" in d:
                raise ApiFehler(f"Stream-Fehler von {ERZEUGER}: {json.dumps(d['error'])[:400]}")
            for ch in d.get("choices", []):
                a = (ch.get("delta") or {}).get("audio") or {}
                if a.get("data"):
                    roh_audio = base64.b64decode(a["data"])
                    pcm += roh_audio
                    a["data"] = f"<{len(roh_audio)} Bytes PCM>"  # Rohdaten liegen im WAV
                if a.get("transcript"):
                    transkript.append(a["transcript"])
            if d.get("usage"):
                usage = d["usage"]
            ereignisse.append(d)
    if not pcm:
        raise ApiFehler(f"{ziel.name}: kein Audio in der Antwort (Transkript {''.join(transkript)!r})")
    meta = {"vorgabe": asdict(v), "stimme": stimme, "anweisung": text, "system": SYSTEM_ERZEUGEN,
            "modell": ERZEUGER, "transkript": "".join(transkript), "usage": usage,
            "sekunden_roh": len(pcm) / 2 / RATE, "ereignisse": ereignisse}
    with wave.open(str(ziel.with_suffix(".wav")), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(bytes(pcm))
    ziel.with_suffix(".erzeugt.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")


def vorgaben_fuer(nur: list[str] | None) -> list[Vorgabe]:
    if not nur:
        return list(VORGABEN)
    unbekannt = set(nur) - set(BUCHSTABEN)
    if unbekannt:
        raise SystemExit(f"Unbekannte Buchstaben: {sorted(unbekannt)}")
    return [v for v in VORGABEN if v.buchstabe in nur]


FEHLER: list[str] = []


def parallel(aufgaben: list, fn, parallel_max: int) -> None:
    """Führt fn(*aufgabe) parallel aus. Fehler werden sofort gemeldet und gesammelt; der Lauf geht weiter
    (ein Kandidat ohne Bewertung wird nie ausgewählt), main() endet dann mit Exit 1 und der Liste.
    Ein erneuter Aufruf holt nur das Fehlende nach."""
    fehler = FEHLER
    sperre = threading.Lock()

    def lauf(a):
        try:
            fn(*a)
        except Exception as e:  # noqa: BLE001 – wird unten gesammelt gemeldet
            with sperre:
                fehler.append(f"{a[0].name if isinstance(a[0], Path) else a[0]}: {e}")
                print(f"  FEHLER {fehler[-1]}", file=sys.stderr)

    with ThreadPoolExecutor(max_workers=parallel_max) as ex:
        list(ex.map(lauf, aufgaben))


def erzeugen(lauf: str, vorgaben: list[Vorgabe], anzahl: int, runde: int, zusaetze: dict[str, str],
             parallel_max: int) -> None:
    aufgaben = []
    for v in vorgaben:
        ordner = lauf_dir(lauf) / slug(v.buchstabe)
        ordner.mkdir(parents=True, exist_ok=True)
        zusatz = zusaetze.get(v.schluessel, "")
        for k in range(anzahl):
            stimme = STIMMEN[k % len(STIMMEN)]
            ziel = ordner / kandidat_id(v, runde, k, stimme)
            if ziel.with_suffix(".wav").exists():
                continue
            aufgaben.append((ziel, v, stimme, anweisung(v, k + runde - 1, zusatz)))
    print(f"erzeugen: {len(aufgaben)} neue Kandidaten (Runde {runde})")
    parallel(aufgaben, erzeuge_kandidat, parallel_max)


# ---------------------------------------------------------------- Nachbearbeiten

FENSTER_S = 0.010
# Hörbar = 10-ms-RMS über SCHWELLE_DB relativ zur lautesten Stelle UND über BODEN_DBFS absolut. Das
# Rauschen der Modellausgabe liegt bei etwa -52 dBFS; eine rein relative Schwelle von -42 dB zählte es bei
# leisen Aufnahmen mit (gemessen: „hörbar“ über die ganzen 4 s). Leise Plosiv-Vorstimmen liegen meist
# 25–30 dB unter der Spitze und bleiben damit drin. Statt ffmpeg-silenceremove: dieselbe Schwelle, aber
# die Grenzen sind gemessen und landen in .bearbeitet.json; geschnitten wird mit atrim.
SCHWELLE_DB = -38.0
BODEN_DBFS = -46.0
LUECKE_S = 0.12  # kürzere Pausen gehören zum selben Laut (Verschlussphase eines Plosivs)
PLOSIV_KAPPE_S = 0.18  # Plosive: nur Verschluss + Lösung + Hauch; ein Schwa danach wird abgeschnitten
VORLAUF_S = 0.030  # vor dem ersten hörbaren Fenster stehen lassen
NACHLAUF_S = 0.060  # nach dem letzten hörbaren Fenster stehen lassen (Ausklang)
ZIEL_LUFS = -16.0
MAX_SPITZE_DB = -1.5
MIN_ROHSPITZE_DB = -30.0  # leiser ist die Rohaufnahme praktisch stumm (kommt vor) – nicht aufblasen
DAUER_KAPPE_S = 1.1  # zu lang gehaltene Dauerlaute auf diese Länge kürzen, mit weichem Ausklang
DAUER_KAPPE_AB_S = 1.2


def lies_wav(pfad: Path) -> np.ndarray:
    with wave.open(str(pfad), "rb") as w:
        if w.getframerate() != RATE or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError(f"{pfad.name}: unerwartetes WAV-Format")
        return np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0


def segmente(x: np.ndarray) -> list[tuple[float, float]]:
    """Hörbare Abschnitte (start_s, ende_s); Pausen unter LUECKE_S werden überbrückt."""
    n = int(RATE * FENSTER_S)
    fenster = len(x) // n
    if fenster == 0:
        return []
    rms = np.sqrt(np.mean(x[: fenster * n].reshape(fenster, n) ** 2, axis=1)) + 1e-12
    db = 20 * np.log10(rms)
    aktiv = np.flatnonzero((db > db.max() + SCHWELLE_DB) & (db > BODEN_DBFS))
    aus: list[list[float]] = []
    for i in aktiv:
        t = i * FENSTER_S
        if aus and t - aus[-1][1] < LUECKE_S:
            aus[-1][1] = t + FENSTER_S
        else:
            aus.append([t, t + FENSTER_S])
    return [(round(a, 3), round(b, 3)) for a, b in aus]


def hoerbarer_bereich(x: np.ndarray) -> tuple[float, float]:
    seg = segmente(x)
    return (seg[0][0], seg[-1][1]) if seg else (0.0, 0.0)


def ffmpeg(*args: str) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-y", *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg Exit {r.returncode}: {r.stderr[-600:]}")
    return r.stderr


def lautheit(pfad: Path, start: float, laenge: float) -> tuple[float, float]:
    """Integrierte Lautheit (LUFS) und True Peak (dBTP) des Ausschnitts. Kurze Laute werden mit Stille
    auf 3 s aufgefüllt (loudnorm misst sonst nicht); die absolute Gate-Grenze ignoriert die Stille."""
    err = ffmpeg("-i", str(pfad), "-af",
                 f"atrim=start={start:.3f}:duration={laenge:.3f},apad=whole_dur=3,loudnorm=print_format=json",
                 "-f", "null", "-")
    teil = err[err.rindex("{"): err.rindex("}") + 1]
    d = json.loads(teil)
    return float(d["input_i"]), float(d["input_tp"])


def bearbeite(wav: Path) -> None:
    x = lies_wav(wav)
    seg = segmente(x)
    meta = json.loads(wav.with_suffix(".erzeugt.json").read_text(encoding="utf-8"))
    klasse = meta["vorgabe"]["klasse"]
    if KLASSEN[klasse].wiederholen and seg:
        def staerke(ab: tuple[float, float]) -> float:
            t = x[int(ab[0] * RATE): int(ab[1] * RATE)]
            return float(np.sqrt(np.mean(t ** 2))) if t.size else 0.0
        seg = [max(seg, key=staerke)]  # dreimal gesprochen: der kräftigste Abschnitt
    start, ende = (seg[0][0], seg[-1][1]) if seg else (0.0, 0.0)
    spitze = 20 * np.log10(np.abs(x).max() + 1e-12)
    info: dict = {"roh_s": len(x) / RATE, "rohspitze_db": round(spitze, 1), "segmente": segmente(x),
                  "hoerbar_von": start, "hoerbar_bis": ende, "lautdauer": round(ende - start, 3)}
    if ende <= start or spitze < MIN_ROHSPITZE_DB:
        info["fehler"] = f"kein hörbarer Laut (Spitze {spitze:.0f} dBFS)"
        wav.with_suffix(".bearbeitet.json").write_text(json.dumps(info, indent=1), encoding="utf-8")
        return
    a = max(0.0, start - VORLAUF_S)
    b = min(len(x) / RATE, ende + NACHLAUF_S)
    aus_fade = 0.030
    if klasse == "dauer" and ende - start > DAUER_KAPPE_AB_S:
        # Gleichförmiger Dauerlaut („mmm“): Ende kappen statt verwerfen; längerer Ausklang.
        b = start + DAUER_KAPPE_S
        aus_fade = 0.150
        info["gekappt_von"] = round(ende - start, 3)
        info["lautdauer"] = DAUER_KAPPE_S
    elif klasse.startswith("plosiv") and ende - start > PLOSIV_KAPPE_S:
        b = start + PLOSIV_KAPPE_S
        aus_fade = 0.050
        info["gekappt_von"] = round(ende - start, 3)
        info["lautdauer"] = PLOSIV_KAPPE_S
    laenge = b - a
    lufs, tp = lautheit(wav, a, laenge)
    gain = min(ZIEL_LUFS - lufs, MAX_SPITZE_DB - tp)
    aus_fade = min(aus_fade, laenge / 3)
    mp3 = wav.with_suffix(".mp3")
    ffmpeg("-i", str(wav), "-af",
           f"atrim=start={a:.3f}:duration={laenge:.3f},asetpts=PTS-STARTPTS,volume={gain:.2f}dB,"
           f"afade=t=in:st=0:d={min(0.015, laenge / 4):.3f},afade=t=out:st={laenge - aus_fade:.3f}:d={aus_fade:.3f}",
           "-ac", "1", "-ar", str(RATE), "-c:a", "libmp3lame", "-b:a", "64k", str(mp3))
    info.update({"datei_s": laenge, "lufs_vorher": lufs, "tp_vorher": tp, "gain_db": gain,
                 "lufs_ziel_erreicht": abs(lufs + gain - ZIEL_LUFS) < 0.5})
    wav.with_suffix(".bearbeitet.json").write_text(json.dumps(info, indent=1), encoding="utf-8")


def nachbearbeiten(lauf: str, parallel_max: int) -> None:
    offen = [(w,) for w in dateien(lauf, "*.wav") if not w.with_suffix(".bearbeitet.json").exists()]
    print(f"nachbearbeiten: {len(offen)} Dateien")
    parallel(offen, bearbeite, parallel_max)


# ---------------------------------------------------------------- Bewerten

SCHEMA1 = {
    "type": "object",
    "properties": {"gehoert": {"type": "string"}, "beschreibung": {"type": "string"}},
    "required": ["gehoert", "beschreibung"],
    "additionalProperties": False,
}

STUFE1 = (
    "Du bist eine erfahrene Phonetikerin für Deutsch. In der Aufnahme spricht eine Person einen einzelnen "
    "Laut oder eine sehr kurze Lautfolge. Schreib genau auf, was akustisch zu hören ist – nicht, was "
    "vermutlich gemeint ist. Achte besonders darauf: welcher Konsonant oder Vokal; stimmhaft oder stimmlos; "
    "ob nach einem Konsonanten ein Vokal hörbar ist (auch ein ganz kurzes „ə“); ob ein Buchstabenname "
    "(„be“, „em“, „ka“ …) oder ein Wort gesprochen wird; Atmer und Nebengeräusche. "
    'Antworte nur mit JSON: {"gehoert": "<IPA in eckigen Klammern>", "beschreibung": "<ein Satz>"}'
)

SCHEMA2 = {
    "type": "object",
    "properties": {
        "gehoert": {"type": "string"},
        "nurLaut": {"type": "boolean"},
        "angehaengterVokal": {"type": "boolean"},
        "korrekt": {"type": "boolean"},
        "klarheit": {"type": "integer"},
        "waerme": {"type": "integer"},
        "note": {"type": "integer"},
        "begruendung": {"type": "string"},
    },
    "required": ["gehoert", "nurLaut", "angehaengterVokal", "korrekt", "klarheit", "waerme", "note", "begruendung"],
    "additionalProperties": False,
}


def stufe2(v: Vorgabe, lautdauer: float) -> str:
    k = KLASSEN[v.klasse]
    return (
        "Jetzt die Vorgabe. Die Aufnahme soll für eine Montessori-Lern-App (Kind knapp drei Jahre) den Laut "
        f"des Buchstabens „{v.buchstabe}“ vorsprechen: [{v.ipa}], wie der Anlaut von „{v.wort}“ – "
        f"{v.beschreibung}. Lautklasse: {k.name}, Sollgröße: {k.dauer_text}. {k.hinweis + ' ' if k.hinweis else ''}"
        "Gemessene Dauer des hörbaren "
        f"Lauts: {lautdauer:.2f} s.\n"
        "Bewerte die Aufnahme gegen die Vorgabe. Bleib bei dem, was du gehört hast – ändere „gehoert“ nicht, "
        "nur weil die Vorgabe anders lautet. Felder: gehoert (IPA, was zu hören ist), nurLaut (true, wenn nur "
        "der Laut und kein Name/Wort/Satz), angehaengterVokal (true, wenn nach dem Konsonanten ein Vokal oder "
        "Schwa hörbar ist; bei Vokal-Vorgaben false, außer es folgt ein zweiter Vokal), korrekt (true, wenn "
        "der gehörte Laut der Vorgabe entspricht), klarheit 1–10, waerme 1–10 (freundlich, ruhig, kindgerecht), "
        "note 1–10 (Gesamteignung für die App; 10 = genau so sollte es klingen), begruendung (höchstens zwei "
        "Sätze, konkret: was müsste anders klingen?). Nur JSON."
    )


def json_aus(text: str | None) -> dict:
    if not text:
        raise ValueError("leere Antwort")
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1].rsplit("```", 1)[0]
    return json.loads(t)


def bewerter_slug(modell: str) -> str:
    return modell.replace("/", "_").replace(":", "_").replace("~", "")


def chat(modell: str, nachrichten: list, schema: dict | None) -> tuple[dict, dict]:
    body: dict = {"model": modell, "messages": nachrichten, "temperature": 0, "usage": {"include": True}}
    if modell.startswith("openai/gpt-audio"):
        body["modalities"] = ["text"]
    if schema and not modell.startswith("openai/gpt-audio"):  # gpt-audio kennt kein json_schema (HTTP 400)
        body["response_format"] = {"type": "json_schema",
                                   "json_schema": {"name": "bewertung", "strict": True, "schema": schema}}
    for versuch in range(2):
        with oeffnen(body) as r:
            antwort = json.loads(r.read())
        if versuch == 0 and "error" not in antwort and not antwort["choices"][0]["message"].get("content"):
            print(f"  leere Antwort von {modell}, einmal wiederholt", file=sys.stderr)
            continue
        break
    if "error" in antwort:
        raise ApiFehler(f"{modell}: {json.dumps(antwort['error'])[:400]}")
    inhalt = antwort["choices"][0]["message"].get("content")
    try:
        return antwort, json_aus(inhalt)
    except ValueError as e:
        raise ValueError(f"{modell}: keine gültige JSON-Antwort ({e}): {str(inhalt)[:200]!r}") from None


def hoer_wav(mp3: Path) -> str:
    """Bearbeiteter Laut als WAV (base64), mit 0,4 s Stille davor/danach, damit sehr kurze Laute nicht am
    Rand des Hörfensters des Bewerters liegen."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(mp3), "-af",
                        "adelay=400:all=1,apad=pad_dur=0.4", "-ac", "1", "-ar", "16000", "-f", "wav", "-"],
                       capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg Exit {r.returncode}: {r.stderr[-400:]!r}")
    return base64.b64encode(r.stdout).decode()


def bewerte(ziel: Path, mp3: Path, modell: str) -> None:
    meta = json.loads(mp3.with_suffix(".erzeugt.json").read_text(encoding="utf-8"))
    v = Vorgabe(**meta["vorgabe"])
    info = json.loads(mp3.with_suffix(".bearbeitet.json").read_text(encoding="utf-8"))
    audio = {"type": "input_audio", "input_audio": {"data": hoer_wav(mp3), "format": "wav"}}
    n1 = [{"role": "user", "content": [{"type": "text", "text": STUFE1}, audio]}]
    a1, j1 = chat(modell, n1, SCHEMA1)
    n2 = n1 + [{"role": "assistant", "content": json.dumps(j1, ensure_ascii=False)},
               {"role": "user", "content": stufe2(v, info["lautdauer"])}]
    a2, j2 = chat(modell, n2, SCHEMA2)
    for feld in ("klarheit", "waerme", "note"):
        if not isinstance(j2.get(feld), int) or not 1 <= j2[feld] <= 10:
            raise ValueError(f"{modell}: Feld {feld} ungültig: {j2.get(feld)!r}")
    kosten = sum(float((a.get("usage") or {}).get("cost") or 0) for a in (a1, a2))
    ergebnis = {"modell": modell, "blind": j1, "bewertung": j2, "kosten": kosten,
                "antworten": [a1, a2]}
    ziel.write_text(json.dumps(ergebnis, ensure_ascii=False, indent=1), encoding="utf-8")


def bewerten(lauf: str, bewerter: list[str], parallel_max: int) -> None:
    aufgaben = []
    for mp3 in dateien(lauf, "*.mp3"):
        for m in bewerter:
            ziel = mp3.with_suffix(f".bewertung.{bewerter_slug(m)}.json")
            if not ziel.exists():
                aufgaben.append((ziel, mp3, m))
    print(f"bewerten: {len(aufgaben)} Bewertungen")
    parallel(aufgaben, bewerte, parallel_max)


# ---------------------------------------------------------------- Auswählen


def kandidaten(lauf: str, bewerter: list[str], ausschluss_anteil: float) -> list[dict]:
    zeilen = []
    for meta_pfad in dateien(lauf, "*.erzeugt.json"):
        stamm = meta_pfad.name[: -len(".erzeugt.json")]
        basis = meta_pfad.parent / stamm
        meta = json.loads(meta_pfad.read_text(encoding="utf-8"))
        v = Vorgabe(**meta["vorgabe"])
        k = KLASSEN[v.klasse]
        z: dict = {"id": stamm, "buchstabe": v.buchstabe, "vorgabe": v.schluessel, "ipa": v.ipa,
                   "stimme": meta["stimme"], "runde": int(re.search(r"-r(\d+)-k\d+-", stamm).group(1)),
                   "transkript": meta["transkript"],
                   "kosten": float((meta.get("usage") or {}).get("cost") or 0), "gruende": [], "noten": {}}
        bp = basis.with_suffix(".bearbeitet.json")
        info = json.loads(bp.read_text(encoding="utf-8")) if bp.exists() else {}
        z["lautdauer"] = round(info.get("lautdauer", 0.0), 3)
        z["mp3"] = f"{slug(v.buchstabe)}/{stamm}.mp3" if basis.with_suffix(".mp3").exists() else ""
        erlaubt = set(sprechform(v).replace(" … ", "")) | set(" .…!,?\n-")
        if not set(meta["transkript"].lower()) <= erlaubt:
            z["gruende"].append("Transkript weicht ab")
        if info.get("fehler"):
            z["gruende"].append(info["fehler"])
        elif info and not (k.min_s <= info["lautdauer"] <= k.max_s):
            z["gruende"].append(f"Dauer {info['lautdauer']:.2f} s außerhalb {k.min_s}–{k.max_s} s")
        bew = []
        for m in bewerter:
            p = basis.with_suffix(f".bewertung.{bewerter_slug(m)}.json")
            if p.exists():
                e = json.loads(p.read_text(encoding="utf-8"))
                z["kosten"] += e["kosten"]
                bew.append(e)
                z["noten"][m] = {**e["bewertung"], "blind": e["blind"].get("gehoert", "")}
        z["vollstaendig"] = len(bew) >= min(MIN_BEWERTER, len(bewerter)) and bool(info)
        if bew:
            n = len(bew)
            z["note"] = round(sum(e["bewertung"]["note"] for e in bew) / n, 2)
            z["klarheit"] = round(sum(e["bewertung"]["klarheit"] for e in bew) / n, 2)
            z["waerme"] = round(sum(e["bewertung"]["waerme"] for e in bew) / n, 2)

            def anteil(fn) -> float:
                return sum(1 for e in bew if fn(e["bewertung"])) / n

            if k.vokal_verboten and anteil(lambda b: b["angehaengterVokal"]) > ausschluss_anteil:
                z["gruende"].append("angehängter Vokal")
            if anteil(lambda b: not b["korrekt"]) > ausschluss_anteil:
                z["gruende"].append("falscher Laut")
            if anteil(lambda b: not b["nurLaut"]) > ausschluss_anteil:
                z["gruende"].append("nicht nur der Laut")
        else:
            z["note"] = z["klarheit"] = z["waerme"] = 0.0
        z["gueltig"] = z["vollstaendig"] and not z["gruende"]
        zeilen.append(z)
    return zeilen


def auswaehlen(lauf: str, bewerter: list[str], ausschluss_anteil: float, je: int = 2) -> dict[str, dict]:
    """Schreibt Tabelle, Auswahl und Hörseite; gibt je Vorgabe {beste_note, auswahl, begruendungen} zurück."""
    zeilen = kandidaten(lauf, bewerter, ausschluss_anteil)
    ordner = lauf_dir(lauf)
    stand: dict[str, dict] = {}
    auswahl_dir = ordner / "auswahl"
    shutil.rmtree(auswahl_dir, ignore_errors=True)  # abgeleitet, wird jedes Mal neu geschrieben
    auswahl_dir.mkdir(parents=True)
    for v in VORGABEN:
        eigene = [z for z in zeilen if z["vorgabe"] == v.schluessel]
        if not eigene:
            continue
        gueltig = sorted((z for z in eigene if z["gueltig"]), key=lambda z: (-z["note"], -z["klarheit"], z["id"]))
        # s hat zwei Vorgaben: je Vorgabe die beste; sonst die besten `je`.
        anzahl = 1 if sum(1 for w in VORGABEN if w.buchstabe == v.buchstabe) > 1 else je
        gewaehlt = gueltig[:anzahl]
        for i, z in enumerate(gewaehlt, 1):
            z["gewaehlt"] = i
            name = f"{slug(v.buchstabe)}.ki{i}.mp3" if anzahl > 1 else f"{slug(v.buchstabe)}.ki-{v.id}.mp3"
            shutil.copyfile(ordner / z["mp3"], auswahl_dir / name)
            z["auswahl_datei"] = name
        letzte = max(z["runde"] for z in eigene)
        stand[v.schluessel] = {
            "beste_note": gewaehlt[0]["note"] if gewaehlt else 0.0,
            "auswahl": [z["id"] for z in gewaehlt],
            "letzte_runde": letzte,
            "begruendungen": [b["begruendung"] for z in eigene if z["runde"] == letzte
                              for b in z["noten"].values()],
            "gruende": [g for z in eigene if z["runde"] == letzte for g in z["gruende"]],
        }
    (ordner / "bewertung.json").write_text(json.dumps(zeilen, ensure_ascii=False, indent=1), encoding="utf-8")
    (ordner / "auswahl.json").write_text(json.dumps(stand, ensure_ascii=False, indent=1), encoding="utf-8")
    with open(ordner / "bewertung.csv", "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        kopf = ["id", "buchstabe", "vorgabe", "stimme", "runde", "lautdauer", "note", "klarheit", "waerme",
                "gueltig", "gewaehlt", "ausschluss", "kosten_usd", "transkript"]
        for m in bewerter:
            kopf += [f"{m} blind", f"{m} gehoert", f"{m} note", f"{m} begruendung"]
        w.writerow(kopf)
        for z in zeilen:
            reihe = [z["id"], z["buchstabe"], z["vorgabe"], z["stimme"], z["runde"], z["lautdauer"], z["note"],
                     z["klarheit"], z["waerme"], z["gueltig"], z.get("gewaehlt", ""), " | ".join(z["gruende"]),
                     round(z["kosten"], 5), z["transkript"]]
            for m in bewerter:
                n = z["noten"].get(m, {})
                reihe += [n.get("blind", ""), n.get("gehoert", ""), n.get("note", ""), n.get("begruendung", "")]
            w.writerow(reihe)
    hoerseite(ordner, zeilen, stand, bewerter)
    gesamt = sum(z["kosten"] for z in zeilen)
    print(f"auswaehlen: {len(zeilen)} Kandidaten, Kosten bisher {gesamt:.4f} USD")
    for s, st in stand.items():
        print(f"  {s:10s} beste Note {st['beste_note']:4.1f}  Auswahl {', '.join(st['auswahl']) or '–'}")
    return stand


def hoerseite(ordner: Path, zeilen: list[dict], stand: dict, bewerter: list[str]) -> None:
    e = html.escape
    teile = [
        "<!doctype html><html lang='de'><head><meta charset='utf-8'><meta name='viewport' "
        "content='width=device-width,initial-scale=1'><title>Laute nachhören</title><style>"
        ":root{--bg:#fbf8f2;--fg:#2b2622;--mut:#7a6f66;--ok:#2f7d4f;--weg:#b3472f;--rand:#e4ddd2}"
        "@media (prefers-color-scheme:dark){:root{--bg:#1e1b18;--fg:#eee6dc;--mut:#a89c90;--ok:#6fc28f;"
        "--weg:#e58a72;--rand:#3a342e}}"
        "body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0 auto;"
        "max-width:1100px;padding:16px}h2{margin:28px 0 6px;font-size:28px}table{border-collapse:collapse;"
        "width:100%}td,th{border-bottom:1px solid var(--rand);padding:6px 8px;vertical-align:top;text-align:left}"
        "th{font-size:12px;color:var(--mut);font-weight:600}.gew{background:rgba(47,125,79,.12)}"
        ".weg{color:var(--weg)}.mut{color:var(--mut);font-size:13px}.note{font-weight:700;font-size:18px}"
        "audio{width:190px;height:34px}.wrap{overflow-x:auto}</style></head><body>",
        "<h1>Laute nachhören</h1><p class='mut'>Grün = ausgewählt. Note = Mittel der Bewerter "
        f"({e(', '.join(bewerter))}). „blind“ = was der Bewerter vor Kenntnis der Vorgabe gehört hat.</p>",
    ]
    for v in VORGABEN:
        eigene = sorted((z for z in zeilen if z["vorgabe"] == v.schluessel),
                        key=lambda z: (-z["gueltig"], -z["note"]))
        if not eigene:
            continue
        st = stand.get(v.schluessel, {})
        teile.append(f"<h2>{e(v.buchstabe)} <span class='mut'>[{e(v.ipa)}] wie „{e(v.wort)}“ · "
                     f"{e(KLASSEN[v.klasse].name)} · beste Note {st.get('beste_note', 0):.1f}</span></h2>"
                     f"<p class='mut'>{e(v.beschreibung)}</p><div class='wrap'><table><tr><th>Hören</th>"
                     "<th>Note</th><th>Stimme / Runde</th><th>Dauer</th><th>Bewerter</th><th>Ausschluss</th></tr>")
        for z in eigene:
            bew = "<br>".join(
                f"<b>{e(m.split('/')[-1])}</b> {n.get('note', '')}: blind {e(str(n.get('blind', '')))}, "
                f"gehört {e(str(n.get('gehoert', '')))} – <span class='mut'>{e(str(n.get('begruendung', '')))}</span>"
                for m, n in z["noten"].items())
            hoeren = f"<audio controls preload='none' src='{e(z['mp3'])}'></audio>" if z["mp3"] else "–"
            klasse = " class='gew'" if z.get("gewaehlt") else ""
            gew = f" ✓ {e(z.get('auswahl_datei', ''))}" if z.get("gewaehlt") else ""
            teile.append(
                f"<tr{klasse}><td>{hoeren}<div class='mut'>{e(z['id'])}{gew}</div></td>"
                f"<td class='note'>{z['note']:.1f}</td><td>{e(z['stimme'])} / {z['runde']}</td>"
                f"<td>{z['lautdauer']:.2f} s</td><td>{bew}</td>"
                f"<td class='weg'>{e(' · '.join(z['gruende']))}</td></tr>")
        teile.append("</table></div>")
    teile.append("</body></html>")
    (ordner / "hoeren.html").write_text("".join(teile), encoding="utf-8")


# ---------------------------------------------------------------- Nachlauf


def schaerfung(st: dict) -> str:
    """Geschärfte Zusatzanweisung aus den Ausschlussgründen und Begründungen der letzten Runde."""
    teile = []
    gruende = st["gruende"]
    if any("Vokal" in g for g in gruende):
        teile.append("Hänge auf keinen Fall einen Vokal an – auch kein kurzes „e“ oder „ə“; der Laut endet "
                     "sofort, Mund bleibt in Lautstellung.")
    if any("nicht nur" in g for g in gruende):
        teile.append("Sprich weder den Buchstabennamen noch ein Wort.")
    if any("Dauer" in g for g in gruende):
        teile.append("Halte die angegebene Dauer genau ein.")
    hinweise = " ".join(dict.fromkeys(b.strip() for b in st["begruendungen"] if b.strip()))
    if hinweise:
        teile.append("Hörer-Rückmeldungen zum letzten Versuch: " + hinweise[:700])
    return " ".join(teile)


def alles(lauf: str, nur: list[str] | None, anzahl: int, bewerter: list[str], ausschluss_anteil: float,
          schwelle: float, runden: int, parallel_max: int) -> None:
    vorgaben = vorgaben_fuer(nur)
    offen = vorgaben
    zusatz_pfad = lauf_dir(lauf) / "nachlauf.json"
    zusaetze: dict[str, dict[str, str]] = (json.loads(zusatz_pfad.read_text(encoding="utf-8"))
                                           if zusatz_pfad.exists() else {})
    for runde in range(1, runden + 1):
        erzeugen(lauf, offen, anzahl, runde, zusaetze.get(str(runde), {}), parallel_max)
        nachbearbeiten(lauf, parallel_max)
        bewerten(lauf, bewerter, parallel_max)
        stand = auswaehlen(lauf, bewerter, ausschluss_anteil)
        schwach = [v for v in vorgaben if stand[v.schluessel]["beste_note"] < schwelle]
        # Bereits erzeugte spätere Runden (idempotenter Neustart) zählen mit.
        if not schwach or runde == runden:
            if schwach:
                print("unter Schwelle nach letzter Runde: " + ", ".join(v.schluessel for v in schwach))
            return
        neu = {v.schluessel: schaerfung(stand[v.schluessel]) for v in schwach}
        zusaetze.setdefault(str(runde + 1), {}).update({k: w for k, w in neu.items()
                                                         if k not in zusaetze.get(str(runde + 1), {})})
        zusatz_pfad.write_text(json.dumps(zusaetze, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"Nachlauf Runde {runde + 1}: " + ", ".join(v.schluessel for v in schwach))
        offen = schwach


# ---------------------------------------------------------------- CLI


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("befehl", choices=["erzeugen", "nachbearbeiten", "bewerten", "auswaehlen", "alles"])
    p.add_argument("--lauf", default="haupt", help="Name des Laufs (Ordner unter tools/.lokal/laute-roh/)")
    p.add_argument("--nur", help="Buchstaben, kommagetrennt (z. B. m,b,k,a)")
    p.add_argument("--anzahl", type=int, default=6, help="Kandidaten je Buchstabe und Runde")
    p.add_argument("--runde", type=int, default=1, help="nur für erzeugen: Rundennummer")
    p.add_argument("--bewerter", default=",".join(BEWERTER))
    p.add_argument("--ausschluss-anteil", type=float, default=0.5,
                   help="ein Befund (Vokal, falscher Laut, nicht nur Laut) schließt aus, wenn MEHR als dieser Anteil der Bewerter ihn meldet (0,5 = Mehrheit)")
    p.add_argument("--schwelle", type=float, default=SCHWELLE)
    p.add_argument("--runden", type=int, default=MAX_RUNDEN)
    p.add_argument("--parallel", type=int, default=6)
    a = p.parse_args()
    nur = [b.strip() for b in a.nur.split(",") if b.strip()] if a.nur else None
    bewerter = [m.strip() for m in a.bewerter.split(",") if m.strip()]
    if shutil.which("ffmpeg") is None:
        raise SystemExit("ffmpeg fehlt im PATH")
    if a.befehl == "erzeugen":
        erzeugen(a.lauf, vorgaben_fuer(nur), a.anzahl, a.runde, {}, a.parallel)
    elif a.befehl == "nachbearbeiten":
        nachbearbeiten(a.lauf, a.parallel)
    elif a.befehl == "bewerten":
        bewerten(a.lauf, bewerter, a.parallel)
    elif a.befehl == "auswaehlen":
        auswaehlen(a.lauf, bewerter, a.ausschluss_anteil)
    else:
        alles(a.lauf, nur, a.anzahl, bewerter, a.ausschluss_anteil, a.schwelle, a.runden, a.parallel)
    if FEHLER:
        raise SystemExit(f"{len(FEHLER)} Fehler (erneuter Aufruf holt das Fehlende nach):\n" + "\n".join(FEHLER))


if __name__ == "__main__":
    main()
