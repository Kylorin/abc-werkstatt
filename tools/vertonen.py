"""Vertont die festen Sätze, Geräusche, gedehnten Laute und den Startwortschatz der ABC-Werkstatt.

Eingabe:  tools/tonliste.json (Ton-Gesamtliste 6a aus docs/konzept-spass-und-lernen.md)
Ausgabe unter public/audio/:
  saetze/<schluessel>.<n>.mp3   feste Sätze und Geräusche, n ab 1; Schlüssel behält die Punkte,
                                Umlaute umgeschrieben (ä→ae, ö→oe, ü→ue, ß→sz)
  laute_lang/<slug>.mp3         gedehnter Laut je Buchstabe (B13), abgeleitet aus laute/ (kein Neuvertonen)
  woerter/<slug>.mp3            Startwortschatz
  manifest.json                 Teile saetze, laute_lang, woerter, stimme neu; laute, namen, varianten
                                werden unverändert übernommen (gehören tools/laute_ki.py)
Stand:    tools/vertonung-stand.json  Fingerabdruck je Datei (Text, Backend, Parameter). Eine Datei wird
                                nur neu erzeugt, wenn sie fehlt, ihr Fingerabdruck sich geändert hat oder
                                --neu gesetzt ist. So ersetzt ein späterer Lauf mit anderem Backend alles.

Backends für Sprache (Geräusche und gedehnte Laute hängen von keinem Backend ab):
  piper       lokal und kostenlos, Stimme de_DE-thorsten-high. Erwartet tools/.lokal/piper/
              (venv + stimmen/, siehe tools/vertonen.sh); bei Worktrees der des Haupt-Checkouts.
  openrouter  openai/gpt-audio über OpenRouter, Schlüssel aus der Umgebung OPENROUTER_API_KEY.
              KOSTENPFLICHTIG: läuft nur mit --kostenpflichtig. Gleiches Ausgabeformat und Manifest.

Nachbearbeitung (alle Dateien gleich): Stille an den Rändern kürzen (Sprache), Lautheit auf den Zielwert
der Tonliste (Standard −16 LUFS, Spitzen begrenzt), MP3 mono 24 kHz 64 kbit/s.
{laut_lang} in einem Satz wird nie gesprochen, sondern als gedehnter Laut eingefügt.

Zum Nachhören: tools/.lokal/ton-uebersicht.html (gitignored) listet jede Datei mit Text als <audio>.

Aufruf:  bash tools/vertonen.sh [--backend piper|openrouter] [--neu] [--nur PRAEFIX] [--nur-manifest]
  --nur PRAEFIX    nur Dateien, deren Pfad unter audio/ so beginnt (z. B. saetze/kachel. oder woerter/)
  --nur-manifest   nichts erzeugen, nur prüfen und manifest.json + Übersicht schreiben
Voraussetzung: Python 3.10+ mit numpy (das Piper-venv hat es), ffmpeg/ffprobe im PATH.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import inspect
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geraeusche  # noqa: E402

WURZEL = Path(__file__).resolve().parent.parent
ZIEL = WURZEL / "public" / "audio"
TONLISTE = WURZEL / "tools" / "tonliste.json"
STAND = WURZEL / "tools" / "vertonung-stand.json"
UEBERSICHT = WURZEL / "tools" / ".lokal" / "ton-uebersicht.html"

RATE = 24000
BITRATE = "64k"
SPITZE = 0.79  # ≈ −2 dBFS vor dem MP3-Kodieren (danach Spitzen um −1 dBFS)
MIN_BYTES = 1024  # Mindestgröße einer Datei …
MIN_BYTES_KURZ = 200  # … außer bei Klängen unter 0,15 s (z. B. geraeusch.klack < 80 ms)
VERSION = 1  # bei Änderungen an der Nachbearbeitung erhöhen → alles wird neu erzeugt

LAUTE = list("abcdefghijklmnopqrstuvwxyz") + ["ä", "ö", "ü", "ß"]
ANLAUT_LAUTE = [b for b in LAUTE if b not in ("c", "q", "x", "y", "ß")]
FREMD = ("laute", "namen", "varianten")  # gehören tools/laute_ki.py
SLUG = {"ä": "ae", "ö": "oe", "ü": "ue", "ß": "sz"}

# Gedehnte Laute (B13): Dauerlaute zeitgestreckt auf ≈ 1,7 s, Plosive/Lautfolgen 2–3× mit Pause.
DAUERLAUTE = set("aeiouäöüyfhjlmnrswvß")
LANG_ZIEL_S = 1.7
LANG_MAX_S = 2.0
PLOSIV_MAX_S = 0.45
PLOSIV_PAUSE_S = 0.28
PLOSIV_ZWEIMAL = set("qx")  # Lautfolgen „kw“, „ks“: zweimal reicht

PAUSE_S = {"…": 0.55, "–": 0.3}
PAUSE_ZWISCHEN_S = 0.25


def slug(text: str) -> str:
    """ASCII-sicherer Dateiname: Umlaute umschreiben, erlaubt a–z, 0–9, - und ."""
    aus = "".join(SLUG.get(z, z) for z in text.lower())
    if not aus or any(not (z.isascii() and (z.isalnum() or z in "-.")) for z in aus):
        raise ValueError(f"Kein ASCII-sicherer Dateiname für {text!r}: {aus!r}")
    return aus


def rel(p: Path) -> str:
    """Pfad relativ zur App-Basis, wie im Manifest: audio/…"""
    return p.relative_to(ZIEL.parent).as_posix()


# ---------------------------------------------------------------- ffmpeg


def ffmpeg(*args: str) -> str:
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "info", *args],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg {' '.join(args[:6])} …: {r.stderr[-800:]}")
    return r.stderr


def schreibe_wav(pfad: Path, x: np.ndarray, rate: int) -> None:
    y = np.clip(x, -1, 1)
    with wave.open(str(pfad), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes((y * 32767).astype("<i2").tobytes())


def lies_audio(pfad: Path) -> np.ndarray:
    """Beliebige Audiodatei → float32 mono RATE Hz."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "error", "-i", str(pfad),
                        "-ac", "1", "-ar", str(RATE), "-f", "f32le", "-"], capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(f"ffmpeg kann {pfad} nicht lesen: {r.stderr[-400:].decode('utf-8', 'replace')}")
    return np.frombuffer(r.stdout, dtype="<f4").astype(np.float32)


def auf_rate(x: np.ndarray, rate: int) -> np.ndarray:
    if rate == RATE:
        return x.astype(np.float32)
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "ein.wav"
        schreibe_wav(p, x, rate)
        return lies_audio(p)


def filter_anwenden(x: np.ndarray, af: str) -> np.ndarray:
    with tempfile.TemporaryDirectory() as d:
        ein, aus = Path(d) / "ein.wav", Path(d) / "aus.wav"
        schreibe_wav(ein, x, RATE)
        ffmpeg("-y", "-i", str(ein), "-af", af, "-ar", str(RATE), "-ac", "1", str(aus))
        return lies_audio(aus)


def lufs(x: np.ndarray) -> float:
    """Integrierte Lautheit. Kurze Klänge werden für die Messung (≥ 4 s) wiederholt, weil die
    EBU-R128-Messung 400-ms-Blöcke braucht."""
    luecke = np.zeros(int(0.15 * RATE), dtype=np.float32)
    teil = np.concatenate([x, luecke])
    wdh = max(1, int(np.ceil(4 * RATE / len(teil))))
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "mess.wav"
        schreibe_wav(p, np.tile(teil, wdh), RATE)
        err = ffmpeg("-i", str(p), "-af", "loudnorm=print_format=json", "-f", "null", "-")
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", err, re.S)
    if not m:
        raise RuntimeError("loudnorm lieferte keine Messung")
    wert = json.loads(m.group(0))["input_i"]
    if wert in ("-inf", "inf"):
        raise RuntimeError("Lautheit nicht messbar (stumm?)")
    return float(wert)


def auf_lufs(x: np.ndarray, ziel: float) -> np.ndarray:
    return (x * 10 ** ((ziel - lufs(x)) / 20)).astype(np.float32)


def raender_kuerzen(x: np.ndarray, vorn_s: float = 0.04, hinten_s: float = 0.08) -> np.ndarray:
    """Stille an den Rändern kürzen: Schwelle 40 dB unter der Spitze, gemessen in 10-ms-Fenstern."""
    fenster = int(0.01 * RATE)
    n = len(x) // fenster
    if n == 0:
        raise RuntimeError("Aufnahme zu kurz")
    rms = np.sqrt(np.mean(x[: n * fenster].reshape(n, fenster) ** 2, axis=1) + 1e-12)
    laut = np.nonzero(rms > rms.max() * 10 ** (-40 / 20))[0]
    a = max(0, laut[0] * fenster - int(vorn_s * RATE))
    b = min(len(x), (laut[-1] + 1) * fenster + int(hinten_s * RATE))
    y = x[a:b].copy()
    k = min(int(0.01 * RATE), len(y) // 4)
    y[:k] *= np.linspace(0, 1, k)
    k = min(int(0.03 * RATE), len(y) // 4)
    y[-k:] *= np.linspace(1, 0, k)
    return y


def schreibe_mp3(ziel: Path, x: np.ndarray, ziel_lufs: float) -> int:
    """Lautheit setzen, Spitzen begrenzen, als MP3 schreiben. Gibt die Dateigröße zurück."""
    y = auf_lufs(x, ziel_lufs)
    ziel.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        ein = Path(d) / "ein.wav"
        # Reserve, damit der Begrenzer arbeiten kann, ohne dass WAV-Clipping vorher zuschlägt.
        schreibe_wav(ein, y * 0.5, RATE)
        ffmpeg("-y", "-i", str(ein), "-af", f"volume=2,alimiter=limit={SPITZE}:level=0:attack=2:release=40",
               "-map_metadata", "-1", "-ar", str(RATE), "-ac", "1", "-c:a", "libmp3lame", "-b:a", BITRATE,
               str(ziel))
    return ziel.stat().st_size


# ---------------------------------------------------------------- Sprach-Backends


class Backend:
    id = ""
    stimme = ""

    def sprich(self, text: str, art: str) -> np.ndarray:
        """Text → float32 mono RATE Hz. art: „satz“ oder „wort“."""
        raise NotImplementedError

    def parameter(self, art: str) -> dict:
        return {}


def piper_ordner() -> Path:
    """tools/.lokal/piper im Repo; in einem Worktree der des Haupt-Checkouts. PIPER_DIR hat Vorrang."""
    if os.environ.get("PIPER_DIR"):
        return Path(os.environ["PIPER_DIR"])
    hier = WURZEL / "tools" / ".lokal" / "piper"
    if hier.exists():
        return hier
    r = subprocess.run(["git", "-C", str(WURZEL), "rev-parse", "--path-format=absolute", "--git-common-dir"],
                       capture_output=True, text=True)
    if r.returncode == 0:
        haupt = Path(r.stdout.strip()).parent / "tools" / ".lokal" / "piper"
        if haupt.exists():
            return haupt
    raise SystemExit("Piper fehlt: tools/.lokal/piper (venv + stimmen/) — siehe tools/vertonen.sh --einrichten")


class PiperBackend(Backend):
    id = "piper"
    STIMME = "de_DE-thorsten-high"
    # Warm und langsam für ein knapp dreijähriges Kind. Piper spricht Einzelwörter sehr schnell
    # (gemessen „Kuh“ 0,26 s, „Igel“ 0,34 s bei 1,1), deshalb Wörter deutlich stärker gedehnt.
    LAENGE = {"satz": 1.3, "wort": 1.7}
    SATZPAUSE_S = 0.3
    # Weniger Zufall in den Lautdauern (Standard der Stimme 0,8): sonst schwankt „Kuh“ zwischen
    # 0,27 und 0,47 s von Lauf zu Lauf.
    DAUER_STREUUNG = 0.4

    def __init__(self) -> None:
        try:
            from piper import PiperVoice, SynthesisConfig
        except ImportError:
            raise SystemExit("Python-Paket piper-tts fehlt — vertonen.py mit dem Piper-venv starten "
                             "(bash tools/vertonen.sh tut das).") from None
        modell = piper_ordner() / "stimmen" / f"{self.STIMME}.onnx"
        if not modell.exists():
            raise SystemExit(f"Piper-Stimme fehlt: {modell.name} unter tools/.lokal/piper/stimmen/")
        self._voice = PiperVoice.load(str(modell))
        self._cfg = SynthesisConfig
        self.stimme = f"piper:{self.STIMME}"

    def parameter(self, art: str) -> dict:
        return {"stimme": self.STIMME, "length_scale": self.LAENGE[art], "noise_w_scale": self.DAUER_STREUUNG,
                "satzpause": self.SATZPAUSE_S}

    def sprich(self, text: str, art: str) -> np.ndarray:
        cfg = self._cfg(length_scale=self.LAENGE[art], noise_w_scale=self.DAUER_STREUUNG)
        teile, rate = [], None
        for chunk in self._voice.synthesize(text, syn_config=cfg):
            rate = chunk.sample_rate
            if teile:
                teile.append(np.zeros(int(self.SATZPAUSE_S * rate), dtype=np.float32))
            teile.append(chunk.audio_float_array.astype(np.float32))
        if not teile:
            raise RuntimeError(f"Piper lieferte kein Audio für {text!r}")
        return auf_rate(np.concatenate(teile), rate)


class OpenRouterBackend(Backend):
    """gpt-audio über OpenRouter (Chat Completions, Audio-Ausgabe als Stream, PCM16 24 kHz mono).
    Kostenpflichtig — nur mit --kostenpflichtig. Schlüssel nur aus der Umgebung, wird nie ausgegeben."""

    id = "openrouter"
    API = "https://openrouter.ai/api/v1/chat/completions"
    MODELL = "openai/gpt-audio"
    STIMME = "coral"  # eine feste, warme Stimme für den ganzen Lauf
    SYSTEM = (
        "Du bist eine warme, ruhige Montessori-Erzieherin und sprichst für ein knapp dreijähriges Kind. "
        "Sprich GENAU den Text der Nutzernachricht vor, langsam, freundlich und deutlich — kein Wort davor "
        "oder danach, keine Begrüßung, keine Erklärung. Nie wie eine Prüfung klingen."
    )

    def __init__(self) -> None:
        self._schluessel = os.environ.get("OPENROUTER_API_KEY", "").strip()
        if not self._schluessel:
            raise SystemExit("OPENROUTER_API_KEY fehlt in der Umgebung.")
        self.stimme = f"openrouter:{self.MODELL}:{self.STIMME}"

    def parameter(self, art: str) -> dict:
        return {"modell": self.MODELL, "stimme": self.STIMME, "system": self.SYSTEM}

    def sprich(self, text: str, art: str) -> np.ndarray:
        body = {
            "model": self.MODELL,
            "modalities": ["text", "audio"],
            "audio": {"voice": self.STIMME, "format": "pcm16"},
            "stream": True,
            "messages": [{"role": "system", "content": self.SYSTEM}, {"role": "user", "content": text}],
        }
        req = urllib.request.Request(self.API, data=json.dumps(body).encode("utf-8"), headers={
            "Authorization": f"Bearer {self._schluessel}", "Content-Type": "application/json",
            "X-Title": "ABC-Werkstatt Vertonung"})
        pcm = bytearray()
        for versuch in range(3):
            try:
                with urllib.request.urlopen(req, timeout=180) as r:
                    for roh in r:
                        zeile = roh.decode("utf-8").strip()
                        if not zeile.startswith("data: ") or zeile == "data: [DONE]":
                            continue
                        d = json.loads(zeile[6:])
                        if "error" in d:
                            raise RuntimeError(f"OpenRouter-Stream-Fehler: {json.dumps(d['error'])[:300]}")
                        for ch in d.get("choices", []):
                            a = (ch.get("delta") or {}).get("audio") or {}
                            if a.get("data"):
                                pcm += base64.b64decode(a["data"])
                break
            except urllib.error.HTTPError as e:
                if e.code in (429, 502, 503) and versuch < 2:
                    time.sleep(5 * (versuch + 1))
                    continue
                raise RuntimeError(f"OpenRouter HTTP {e.code}: {e.read()[:300].decode('utf-8', 'replace')}") from None
        if not pcm:
            raise RuntimeError(f"OpenRouter lieferte kein Audio für {text!r}")
        return (np.frombuffer(bytes(pcm), dtype="<i2").astype(np.float32) / 32768.0)


# ---------------------------------------------------------------- Aufträge


@dataclass
class Auftrag:
    datei: Path
    art: str  # „satz“ | „wort“ | „geraeusch“ | „laut_lang“
    schluessel: str
    text: str = ""
    variante: int = 1
    lufs: float = -16.0
    quelle: str = ""  # laut_lang: Ausgangsdatei
    gruppe: str = ""
    meta: dict = field(default_factory=dict)


def segmente(text: str) -> list[tuple[str, object]]:
    """Satz → [("text", s) | ("laut", b-Platzhalter) | ("pause", s)]."""
    aus: list[tuple[str, object]] = []
    for teil in re.split(r"(\{laut_lang\}|…|–)", text):
        if teil == "{laut_lang}":
            aus.append(("laut", None))
        elif teil in PAUSE_S:
            aus.append(("pause", PAUSE_S[teil]))
        else:
            t = teil.strip().lstrip(".,:;!?").strip()
            if t and re.search(r"\w", t):
                aus.append(("text", t))
    return aus


def aussprache(text: str, ersetzungen: dict[str, str]) -> str:
    for alt, neu in ersetzungen.items():
        if alt.startswith("_"):
            continue
        text = re.sub(rf"(?<![\w']){re.escape(alt)}(?![\w'])", neu, text)
    return text


def laut_lang_datei(b: str) -> Path:
    return ZIEL / "laute_lang" / f"{slug(b)}.mp3"


def auftraege(liste: dict, manifest: dict) -> list[Auftrag]:
    jobs: list[Auftrag] = []
    ziel_lufs = float(liste.get("lufs", -16))
    for b in LAUTE:
        quelle = ZIEL.parent / manifest["laute"][b]
        jobs.append(Auftrag(laut_lang_datei(b), "laut_lang", b, quelle=str(quelle), lufs=ziel_lufs,
                            gruppe="Gedehnte Laute (laute_lang)"))
    for k, eintrag in liste["geraeusche"].items():
        for n in range(1, int(eintrag["varianten"]) + 1):
            jobs.append(Auftrag(ZIEL / "saetze" / f"{slug(k)}.{n}.mp3", "geraeusch", k, variante=n,
                                lufs=float(eintrag.get("lufs", ziel_lufs)), gruppe="Geräusche"))
    saetze: list[tuple[str, list[str], float, str]] = []
    for k, eintrag in liste["saetze"].items():
        varianten = eintrag if isinstance(eintrag, list) else eintrag["varianten"]
        l = ziel_lufs if isinstance(eintrag, list) else float(eintrag.get("lufs", ziel_lufs))
        saetze.append((k, varianten, l, "Feste Sätze"))
    for name, varianten in liste["laut_saetze"].items():
        if name.startswith("_"):
            continue
        for b in ANLAUT_LAUTE:
            saetze.append((f"{name}.{b}", list(varianten),
                           ziel_lufs, f"Laut-Sätze: {name}"))
    for k, varianten, l, gruppe in saetze:
        for n, text in enumerate(varianten, start=1):
            jobs.append(Auftrag(ZIEL / "saetze" / f"{slug(k)}.{n}.mp3", "satz", k, text=text, variante=n,
                                lufs=l, gruppe=gruppe))
    for w in liste["woerter"]:
        jobs.append(Auftrag(ZIEL / "woerter" / f"{slug(w)}.mp3", "wort", w, text=w[:1].upper() + w[1:],
                            lufs=ziel_lufs, gruppe="Startwortschatz"))
    dateien = [j.datei for j in jobs]
    if len(set(dateien)) != len(dateien):
        raise RuntimeError("Tonliste ergibt doppelte Dateinamen")
    return jobs


def laut_buchstabe(job: Auftrag) -> str | None:
    """Buchstabe für {laut_lang} in einem Laut-Satz (Schlüssel <name>.<b>)."""
    teile = job.schluessel.rsplit(".", 1)
    return teile[1] if len(teile) == 2 and teile[1] in LAUTE else None


def datei_hash(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()[:16]


def fingerabdruck(job: Auftrag, backend: Backend | None, liste: dict) -> str:
    d: dict = {"v": VERSION, "art": job.art, "lufs": job.lufs, "rate": RATE, "bitrate": BITRATE, "spitze": SPITZE}
    if job.art == "laut_lang":
        d["quelle"] = datei_hash(Path(job.quelle))
        # Rezept mit in den Fingerabdruck: eine Änderung an der Ableitung erzeugt die Laute neu (kostenlos).
        d["rezept"] = hashlib.sha256((inspect.getsource(erzeuge_laut_lang) + repr(
            (sorted(DAUERLAUTE), LANG_ZIEL_S, LANG_MAX_S, PLOSIV_MAX_S, PLOSIV_PAUSE_S, sorted(PLOSIV_ZWEIMAL)))
        ).encode("utf-8")).hexdigest()[:16]
    elif job.art == "geraeusch":
        d["rezept"] = hashlib.sha256(Path(geraeusche.__file__).read_bytes()).hexdigest()[:16]
        d["schluessel"], d["variante"] = job.schluessel, job.variante
    else:
        assert backend is not None
        d["backend"] = backend.id
        d["parameter"] = backend.parameter(job.art)
        d["text"] = aussprache(job.text, liste.get("aussprache", {}).get(backend.id, {}))
        b = laut_buchstabe(job) if "{laut_lang}" in job.text else None
        if b:
            d["laut"] = datei_hash(laut_lang_datei(b))
    return hashlib.sha256(json.dumps(d, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()[:20]


# ---------------------------------------------------------------- Erzeugen


def erzeuge_laut_lang(job: Auftrag) -> np.ndarray:
    b = job.schluessel
    x = raender_kuerzen(lies_audio(Path(job.quelle)), 0.0, 0.02)
    dauer = len(x) / RATE
    if b in DAUERLAUTE:
        # rubberband streckt pro Durchgang höchstens etwa auf das Doppelte (gemessen: tempo 0,27 ergab
        # nur ×1,9) — deshalb in Stufen bis zur Zieldauer.
        for _ in range(8):
            dauer = len(x) / RATE
            if dauer >= LANG_ZIEL_S - 0.05:
                break
            tempo = max(dauer / LANG_ZIEL_S, 0.55)
            x = filter_anwenden(x, f"rubberband=tempo={tempo:.4f}:window=long:smoothing=on:formant=preserved")
            x = raender_kuerzen(x, 0.0, 0.02)
        if len(x) / RATE < 1.5:
            raise RuntimeError(f"laute_lang.{b}: unter 1,5 s geblieben ({len(x) / RATE:.2f} s)")
        x = x[: int(LANG_MAX_S * RATE)]
        k = int(0.08 * RATE)
        x[-k:] *= np.linspace(1, 0, k)
        return x
    x = x[: int(PLOSIV_MAX_S * RATE)]
    k = min(int(0.02 * RATE), len(x) // 4)
    x[-k:] *= np.linspace(1, 0, k)
    wdh = 2 if b in PLOSIV_ZWEIMAL else 3
    pause = np.zeros(int(PLOSIV_PAUSE_S * RATE), dtype=np.float32)
    teile: list[np.ndarray] = []
    for i in range(wdh):
        if i:
            teile.append(pause)
        teile.append(x)
    return np.concatenate(teile)


def erzeuge_sprache(job: Auftrag, backend: Backend, liste: dict) -> np.ndarray:
    ersetzungen = liste.get("aussprache", {}).get(backend.id, {})
    teile: list[np.ndarray] = []
    vorher_pause = True
    for art, wert in segmente(job.text):
        if art == "pause":
            teile.append(np.zeros(int(float(wert) * RATE), dtype=np.float32))
            vorher_pause = True
            continue
        if not vorher_pause:
            teile.append(np.zeros(int(PAUSE_ZWISCHEN_S * RATE), dtype=np.float32))
        if art == "laut":
            b = laut_buchstabe(job)
            if not b:
                raise RuntimeError(f"{job.schluessel}: {{laut_lang}} ohne Buchstaben im Schlüssel")
            seg = lies_audio(laut_lang_datei(b))
        else:
            seg = raender_kuerzen(backend.sprich(aussprache(str(wert), ersetzungen), job.art), 0.02, 0.04)
        teile.append(auf_lufs(seg, job.lufs))
        vorher_pause = False
    if not teile:
        raise RuntimeError(f"{job.schluessel}: leerer Text")
    return raender_kuerzen(np.concatenate(teile))


def groesse_ok(p: Path) -> str | None:
    if not p.exists():
        return f"fehlt: {rel(p)}"
    groesse = p.stat().st_size
    kurz = groesse < MIN_BYTES and dauer_s(p) < 0.15
    if groesse <= (MIN_BYTES_KURZ if kurz else MIN_BYTES):
        return f"zu klein ({groesse} B): {rel(p)}"
    return None


def dauer_s(p: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)],
                       capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        raise RuntimeError(f"ffprobe kann {p} nicht lesen") from None


# ---------------------------------------------------------------- Manifest + Übersicht


def baue_manifest(alt: dict, jobs: list[Auftrag], stimme: str) -> dict:
    m: dict = {t: alt[t] for t in ("laute", "namen")}
    m["woerter"] = {j.schluessel: rel(j.datei) for j in jobs if j.art == "wort"}
    saetze: dict[str, list[str]] = {}
    for j in jobs:
        if j.art in ("satz", "geraeusch"):
            saetze.setdefault(j.schluessel, []).append(rel(j.datei))
    m["saetze"] = saetze
    m["laute_lang"] = {j.schluessel: rel(j.datei) for j in jobs if j.art == "laut_lang"}
    m["varianten"] = alt["varianten"]
    m["stimme"] = stimme
    for k, v in alt.items():  # unbekannte Bestandsfelder erhalten
        m.setdefault(k, v)
    return m


def schreibe_uebersicht(jobs: list[Auftrag], stand: dict) -> None:
    gruppen: dict[str, list[Auftrag]] = {}
    for j in jobs:
        gruppen.setdefault(j.gruppe, []).append(j)
    zeilen = ["<!doctype html><meta charset='utf-8'><title>Ton-Übersicht</title>",
              "<style>body{font:15px system-ui;margin:16px;max-width:1100px}td{padding:3px 8px;"
              "border-bottom:1px solid #ddd;vertical-align:middle}audio{height:30px}h2{margin-top:28px}"
              "code{color:#555}</style>",
              "<h1>Ton-Übersicht ABC-Werkstatt</h1><p>Alle vorab erzeugten Dateien zum gezielten Nachhören. "
              "Hören: Text sauber? Gedehnter Laut ohne Schwa (kein „be“)? Geräusche leise und freundlich? "
              "Varianten gleich warm und gleich lang?</p>"]
    for g, js in gruppen.items():
        zeilen.append(f"<h2>{html.escape(g)} ({len(js)})</h2><table>")
        for j in js:
            info = stand.get(rel(j.datei), {})
            text = j.text or (f"aus {Path(j.quelle).name}" if j.quelle else "synthetisch")
            zeilen.append(
                f"<tr><td><code>{html.escape(j.schluessel)}</code> {j.variante if j.art in ('satz', 'geraeusch') else ''}"
                f"</td><td>{html.escape(text)}</td><td>{info.get('dauer_s', '?')} s</td>"
                f"<td><audio controls preload='none' src='../../public/{html.escape(rel(j.datei))}'></audio></td></tr>")
        zeilen.append("</table>")
    UEBERSICHT.parent.mkdir(parents=True, exist_ok=True)
    UEBERSICHT.write_text("\n".join(zeilen) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- Ablauf


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--backend", choices=["piper", "openrouter"], default="piper")
    ap.add_argument("--kostenpflichtig", action="store_true", help="nötig für --backend openrouter")
    ap.add_argument("--neu", action="store_true", help="alle (bzw. alle unter --nur) neu erzeugen")
    ap.add_argument("--nur", metavar="PRAEFIX", help="nur Dateien, deren Pfad unter audio/ so beginnt")
    ap.add_argument("--nur-manifest", action="store_true", help="nichts erzeugen, nur prüfen + Manifest")
    args = ap.parse_args()

    liste = json.loads(TONLISTE.read_text(encoding="utf-8"))
    alt = json.loads((ZIEL / "manifest.json").read_text(encoding="utf-8"))
    for teil in FREMD:
        if set(alt.get(teil, {})) != set(LAUTE):
            raise RuntimeError(f"manifest.json: Teil {teil!r} deckt nicht alle Buchstaben ab (gehört tools/laute_ki.py)")
    jobs = auftraege(liste, alt)
    stand: dict = json.loads(STAND.read_text(encoding="utf-8")) if STAND.exists() else {}

    backend: Backend | None = None
    if args.backend == "openrouter" and not args.nur_manifest:
        if not args.kostenpflichtig:
            print("--backend openrouter kostet Geld und läuft nur mit --kostenpflichtig.", file=sys.stderr)
            return 2
        backend = OpenRouterBackend()
    elif not args.nur_manifest:
        backend = PiperBackend()

    neu = uebersprungen = 0
    fehler: list[str] = []
    # Reihenfolge zählt: gedehnte Laute zuerst, Laut-Sätze bauen darauf auf.
    for job in jobs if not args.nur_manifest else []:
        pfad = job.datei.relative_to(ZIEL).as_posix()
        if args.nur and not pfad.startswith(args.nur):
            continue
        fa = fingerabdruck(job, backend, liste)
        if job.datei.exists() and not args.neu and stand.get(rel(job.datei), {}).get("fingerabdruck") == fa:
            uebersprungen += 1
            continue
        try:
            if job.art == "laut_lang":
                x = erzeuge_laut_lang(job)
            elif job.art == "geraeusch":
                x = geraeusche.erzeuge(job.schluessel, job.variante)
                if geraeusche.RATE != RATE:
                    raise RuntimeError("geraeusche.RATE weicht ab")
            else:
                assert backend is not None
                x = erzeuge_sprache(job, backend, liste)
            groesse = schreibe_mp3(job.datei, x, job.lufs)
        except Exception as e:  # einzeln melden, am Ende Exit 1
            fehler.append(f"{pfad}: {e}")
            print(f"  FEHLER {pfad}: {e}", file=sys.stderr)
            continue
        quelle = backend.stimme if job.art in ("satz", "wort") and backend else (
            "abgeleitet aus laute/" if job.art == "laut_lang" else "synthetisch (tools/geraeusche.py)")
        stand[rel(job.datei)] = {"fingerabdruck": fa, "quelle": quelle, "text": job.text,
                                 "dauer_s": round(len(x) / RATE, 2), "bytes": groesse}
        neu += 1
        print(f"  {pfad}  {groesse} B  {len(x) / RATE:.2f} s")
        STAND.write_text(json.dumps(dict(sorted(stand.items())), ensure_ascii=False, indent=1) + "\n",
                         encoding="utf-8", newline="\n")
    if not args.nur_manifest:
        print(f"neu: {neu}, übersprungen: {uebersprungen}, Fehler: {len(fehler)}")

    # Bestand prüfen: jede Datei im Manifest existiert und ist groß genug (auch übernommene Laute/Namen).
    pruef = [j.datei for j in jobs]
    pruef += [ZIEL.parent / alt[t][b] for t in ("laute", "namen") for b in LAUTE]
    pruef += [ZIEL.parent / v["url"] for b in LAUTE for v in alt["varianten"][b]]
    fehler += [f for f in (groesse_ok(p) for p in pruef) if f]
    erwartet = {j.datei.resolve() for j in jobs}
    for ordner in ("saetze", "laute_lang", "woerter"):
        for p in sorted((ZIEL / ordner).glob("*")) if (ZIEL / ordner).exists() else []:
            if p.resolve() not in erwartet:
                print(f"  Hinweis: verwaist (nicht in der Tonliste): {rel(p)}", file=sys.stderr)

    schreibe_uebersicht(jobs, stand)
    if fehler:
        print("\n".join(fehler), file=sys.stderr)
        print("manifest.json NICHT geschrieben.", file=sys.stderr)
        return 1

    # Stimme: welches Backend die Sprache dieses Bestands erzeugt hat (aus dem Stand, nicht geraten).
    stimmen = sorted({stand[rel(j.datei)]["quelle"] for j in jobs if j.art in ("satz", "wort") and rel(j.datei) in stand})
    if len(stimmen) != 1:
        print(f"Sätze/Wörter stammen nicht aus genau einer Stimme: {stimmen} — mit --neu einheitlich erzeugen.",
              file=sys.stderr)
        return 1
    m = baue_manifest(alt, jobs, stimmen[0])
    (ZIEL / "manifest.json").write_text(json.dumps(m, ensure_ascii=False, indent=2) + "\n",
                                        encoding="utf-8", newline="\n")
    gesamt = sum(p.stat().st_size for p in ZIEL.rglob("*") if p.is_file())
    print(f"manifest.json: {len(m['saetze'])} Satz-/Geräusch-Schlüssel "
          f"({sum(len(v) for v in m['saetze'].values())} Dateien), {len(m['laute_lang'])} gedehnte Laute, "
          f"{len(m['woerter'])} Wörter, Stimme {m['stimme']}")
    print(f"public/audio gesamt: {gesamt / 1024 / 1024:.2f} MB")
    print(f"Übersicht zum Nachhören: {UEBERSICHT.relative_to(WURZEL).as_posix()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
