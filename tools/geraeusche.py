"""Synthetische Geräusche der ABC-Werkstatt (Konzept 6a, Abschnitt „Geräusche“).

Alles wird hier aus Sinus, Rauschen und Hüllkurven gerechnet — nichts aus der Serie, nichts
heruntergeladen. Jede Variante ist deterministisch (fester Zufallssamen je Schlüssel + Variante),
damit ein erneuter Lauf dieselben Dateien ergibt.

Benutzt von tools/vertonen.py: erzeuge(schluessel, variante) → float32-Mono bei RATE Hz.
Lautheit, Ränder und MP3 macht vertonen.py.

Direktaufruf zum Nachhören einzelner Geräusche als WAV:
  python tools/geraeusche.py geraeusch.wisch 1 /pfad/ausgabe.wav
"""

from __future__ import annotations

import sys
import wave
import zlib

import numpy as np

RATE = 24000


# ---------------------------------------------------------------- Bausteine


def _rng(schluessel: str, variante: int) -> np.random.Generator:
    return np.random.default_rng(zlib.crc32(f"{schluessel}#{variante}".encode("utf-8")))


def _t(sek: float) -> np.ndarray:
    return np.arange(int(sek * RATE)) / RATE


def _stille(sek: float) -> np.ndarray:
    return np.zeros(int(sek * RATE), dtype=np.float64)


def _tiefpass(x: np.ndarray, hz: float | np.ndarray) -> np.ndarray:
    """Einpoliger Tiefpass; hz darf je Sample variieren (Filterfahrt)."""
    hz = np.broadcast_to(np.asarray(hz, dtype=np.float64), x.shape)
    a = np.exp(-2 * np.pi * hz / RATE)
    y = np.empty_like(x)
    z = 0.0
    for i in range(len(x)):
        z = (1 - a[i]) * x[i] + a[i] * z
        y[i] = z
    return y


def _bandpass(x: np.ndarray, tief: float | np.ndarray, hoch: float | np.ndarray) -> np.ndarray:
    lp = _tiefpass(x, hoch)
    return lp - _tiefpass(lp, tief)


def _huelle(n: int, an: float, ab: float, form: float = 1.0) -> np.ndarray:
    """Anstieg über an s, danach Abfall über den Rest (form > 1 = schnellerer Abfall)."""
    t = np.arange(n) / RATE
    gesamt = n / RATE
    e = np.where(t < an, t / max(an, 1e-6), np.clip(1 - (t - an) / max(gesamt - an, 1e-6), 0, 1) ** form)
    if ab > 0:
        k = int(ab * RATE)
        e[-k:] *= np.linspace(1, 0, k)
    return e


def _ton(hz_start: float, hz_ende: float, sek: float, zerfall: float = 6.0,
         obertoene: tuple[float, ...] = (1.0,), an: float = 0.004) -> np.ndarray:
    """Sinus mit Tonhöhenfahrt (exponentiell) und exponentiellem Ausklang."""
    t = _t(sek)
    hz = hz_start * (hz_ende / hz_start) ** (t / sek)
    phase = 2 * np.pi * np.cumsum(hz) / RATE
    x = sum(g * np.sin((i + 1) * phase) for i, g in enumerate(obertoene))
    hull = np.exp(-zerfall * t) * np.clip(t / an, 0, 1)
    return x * hull


def _glocke(hz: float, sek: float, zerfall: float = 3.0) -> np.ndarray:
    """Spieluhr-/Glockenton: Grundton plus leicht unharmonische Obertöne, weicher Anschlag."""
    t = _t(sek)
    x = (np.sin(2 * np.pi * hz * t) + 0.35 * np.sin(2 * np.pi * hz * 2.01 * t) * np.exp(-4 * t)
         + 0.15 * np.sin(2 * np.pi * hz * 3.98 * t) * np.exp(-7 * t))
    return x * np.exp(-zerfall * t) * np.clip(t / 0.003, 0, 1)


def _mische(*teile: tuple[float, np.ndarray]) -> np.ndarray:
    """(Startzeit s, Signal) → gemischtes Signal."""
    ende = max(int(s * RATE) + len(x) for s, x in teile)
    y = np.zeros(ende)
    for s, x in teile:
        i = int(s * RATE)
        y[i:i + len(x)] += x
    return y


def _rauschen(rng: np.random.Generator, sek: float) -> np.ndarray:
    return rng.standard_normal(int(sek * RATE))


def _note(name: str) -> float:
    stufen = {"c": -9, "d": -7, "e": -5, "f": -4, "g": -2, "a": 0, "h": 2}
    return 440.0 * 2 ** ((stufen[name[0]] + 12 * (int(name[1:]) - 4)) / 12)


# ---------------------------------------------------------------- Geräusche


def wisch(rng, v):
    """Tuch über Tafel: bandbegrenztes Rauschen, Filter wandert, weiche Hüllkurve, 300–500 ms."""
    sek = [0.42, 0.34, 0.48][(v - 1) % 3]
    n = int(sek * RATE)
    fahrt = np.linspace([1800, 2400, 1500][(v - 1) % 3], [3200, 3800, 2600][(v - 1) % 3], n)
    x = _bandpass(_rauschen(rng, sek), 500, fahrt)
    return x * np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5


def zurueck(rng, v):
    """Variante 1: umgekehrtes Wischen (anschwellend, kurz). Variante 2: sanftes Plopp."""
    if v == 1:
        x = wisch(rng, 2)[::-1]
        return x * np.linspace(0.6, 1, len(x))
    return _ton(320, 560, 0.16, zerfall=22, obertoene=(1.0, 0.2))


def schlaflied(rng, v):
    """Leise Spieluhr, ≈ 6 s: Anfang von Brahms' Wiegenlied (gemeinfrei), hohe Lage, langsam."""
    melodie = [("e5", .5), ("e5", .5), ("g5", 1.2), ("e5", .5), ("e5", .5), ("g5", 1.2),
               ("e5", .4), ("g5", .4), ("c6", .7), ("h5", .7), ("a5", .7), ("a5", .8)]
    teile, t = [], 0.0
    for name, dauer in melodie:
        teile.append((t, _glocke(_note(name), dauer + 1.0, zerfall=2.6)))
        t += dauer * 0.62
    return _mische(*teile)


def decke_wackelt(rng, v):
    """Stoffrascheln: tiefes, gefiltertes Rauschen mit unregelmäßigem Zittern, ≈ 0,7 s."""
    sek = 0.7 if v == 1 else 0.85
    n = int(sek * RATE)
    x = _bandpass(_rauschen(rng, sek), 250, 1400)
    zittern = 0.55 + 0.45 * np.sin(2 * np.pi * (7 + 3 * v) * _t(sek) + rng.uniform(0, 6))
    return x * zittern * np.sin(np.pi * np.linspace(0, 1, n)) ** 0.8


def decke_weg(rng, v):
    """Wusch: Rauschen mit steigender Filterfahrt, schnell an, weich aus, ≈ 0,5 s."""
    sek = 0.5 if v == 1 else 0.42
    n = int(sek * RATE)
    fahrt = np.geomspace(400, 5000 if v == 1 else 3800, n)
    x = _tiefpass(_rauschen(rng, sek), fahrt)
    return x * _huelle(n, 0.12, 0.05, form=1.6)


def plopp(rng, v):
    """Tier lugt hervor: kurzer Sinus mit steigender Tonhöhe, wie ein Korken."""
    return _ton(*( (260, 620) if v == 1 else (300, 760) ), 0.14, zerfall=24, obertoene=(1.0, 0.15))


def trommel(rng, v):
    """Weicher Trommelfleck: tiefer Sinus mit fallender Tonhöhe plus gedämpfter Anschlag."""
    hz = [150, 120, 180][(v - 1) % 3]
    koerper = _ton(hz, hz * 0.65, 0.45, zerfall=9)
    schlag = _tiefpass(_rauschen(rng, 0.03), 1200) * np.linspace(1, 0, int(0.03 * RATE)) * 0.6
    return _mische((0, koerper), (0, schlag))


def oh_oh(rng, v):
    """Sanftes „oh-oh“: zwei weiche Töne abwärts (kleine Terz), runder Klang, nicht alarmierend."""
    a = _note("e5") if v == 1 else _note("h4")
    b = a / 2 ** (3 / 12)
    eins = _ton(a, a, 0.28, zerfall=5, obertoene=(1.0, 0.25), an=0.03)
    zwei = _ton(b * 0.97, b * 0.94, 0.42, zerfall=4, obertoene=(1.0, 0.25), an=0.03)
    return _mische((0, eins), (0.26, zwei))


def loesung(rng, v):
    """Kurzer Lösungsklang ≈ 1 s: aufsteigender Dur-Dreiklang als Glocken."""
    noten = ["c5", "e5", "g5", "c6"] if v == 1 else ["g4", "h4", "d5", "g5"]
    return _mische(*[(i * 0.13, _glocke(_note(n), 0.75, zerfall=4.5)) for i, n in enumerate(noten)])


def klack(rng, v):
    """Stoff-Plopp beim Ablegen eines Buchstabens, < 80 ms."""
    hz = [420, 360, 480][(v - 1) % 3]
    koerper = _ton(hz, hz * 0.7, 0.07, zerfall=60)
    stoff = _tiefpass(_rauschen(rng, 0.02), 2500) * np.linspace(1, 0, int(0.02 * RATE)) * 0.3
    return _mische((0, koerper), (0, stoff))


# ---- Bewegungen (F4): je Art ein kurzes, eindeutiges Motiv, Variante 2 leicht anders gestimmt.


def b_huepft(rng, v):
    f = 1.0 if v == 1 else 1.15
    sprung = lambda: _ton(220 * f, 520 * f, 0.18, zerfall=8, obertoene=(1.0, 0.2))
    return _mische((0, sprung()), (0.22, sprung() * 0.8))


def b_fliegt(rng, v):
    sek = 0.7
    n = int(sek * RATE)
    flattern = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * (14 if v == 1 else 18) * _t(sek)))
    x = _bandpass(_rauschen(rng, sek), 600, 2600) * _tiefpass(flattern, 120)
    return x * np.sin(np.pi * np.linspace(0, 1, n))


def b_kriecht(rng, v):
    teile = []
    for i in range(4 if v == 1 else 5):
        st = _bandpass(_rauschen(rng, 0.12), 200, 900) * np.sin(np.pi * np.linspace(0, 1, int(0.12 * RATE)))
        teile.append((i * 0.2, st))
    return _mische(*teile)


def b_schwimmt(rng, v):
    teile = []
    for i in range(5):
        hz = rng.uniform(500, 900) * (1.0 if v == 1 else 0.85)
        teile.append((i * 0.11 + rng.uniform(0, 0.04), _ton(hz, hz * 1.8, 0.07, zerfall=30)))
    return _mische(*teile)


def b_rollt(rng, v):
    sek = 0.8
    x = _tiefpass(_rauschen(rng, sek), 300) * 3
    x *= 0.6 + 0.4 * np.sin(2 * np.pi * (6 if v == 1 else 8) * _t(sek))
    return x * np.sin(np.pi * np.linspace(0, 1, len(x)))


def b_klettert(rng, v):
    noten = ["c5", "d5", "e5", "f5"] if v == 1 else ["g4", "a4", "h4", "c5"]
    return _mische(*[(i * 0.16, _ton(_note(n), _note(n), 0.1, zerfall=25, obertoene=(1.0, 0.3)))
                     for i, n in enumerate(noten)])


def b_watschelt(rng, v):
    a, b = (190, 150) if v == 1 else (230, 180)
    return _mische(*[(i * 0.2, _ton(f, f * 0.8, 0.12, zerfall=22)) for i, f in enumerate([a, b, a, b])])


def b_schlaengelt(rng, v):
    sek = 0.9
    n = int(sek * RATE)
    fahrt = 3500 + 1500 * np.sin(2 * np.pi * (2.5 if v == 1 else 3.2) * _t(sek))
    x = _bandpass(_rauschen(rng, sek), 2000, fahrt)
    return x * np.sin(np.pi * np.linspace(0, 1, n)) ** 0.7


def b_stampft(rng, v):
    hz = 90 if v == 1 else 110
    return _mische(*[(i * 0.3, _ton(hz, hz * 0.6, 0.28, zerfall=11)) for i in range(3)])


def b_tanzt(rng, v):
    noten = ["g5", "e5", "g5", "c6"] if v == 1 else ["e5", "c5", "e5", "g5"]
    zeiten = [0, 0.14, 0.28, 0.48]
    return _mische(*[(z, _glocke(_note(n), 0.35, zerfall=7)) for z, n in zip(zeiten, noten)])


GERAEUSCHE = {
    "geraeusch.wisch": wisch,
    "geraeusch.zurueck": zurueck,
    "geraeusch.schlaflied": schlaflied,
    "geraeusch.decke-wackelt": decke_wackelt,
    "geraeusch.decke-weg": decke_weg,
    "geraeusch.plopp": plopp,
    "geraeusch.trommel": trommel,
    "geraeusch.oh-oh": oh_oh,
    "geraeusch.loesung": loesung,
    "geraeusch.klack": klack,
    "geraeusch.bewegung.huepft": b_huepft,
    "geraeusch.bewegung.fliegt": b_fliegt,
    "geraeusch.bewegung.kriecht": b_kriecht,
    "geraeusch.bewegung.schwimmt": b_schwimmt,
    "geraeusch.bewegung.rollt": b_rollt,
    "geraeusch.bewegung.klettert": b_klettert,
    "geraeusch.bewegung.watschelt": b_watschelt,
    "geraeusch.bewegung.schlaengelt": b_schlaengelt,
    "geraeusch.bewegung.stampft": b_stampft,
    "geraeusch.bewegung.tanzt": b_tanzt,
}


def erzeuge(schluessel: str, variante: int) -> np.ndarray:
    """Geräusch als float32 in [-1, 1] (Spitze 0,9), Mono, RATE Hz. Unbekannter Schlüssel = Fehler."""
    if schluessel not in GERAEUSCHE:
        raise KeyError(f"Kein Geräusch-Rezept für {schluessel!r} (tools/geraeusche.py)")
    x = np.asarray(GERAEUSCHE[schluessel](_rng(schluessel, variante), variante), dtype=np.float64)
    spitze = float(np.max(np.abs(x)))
    if spitze <= 0:
        raise RuntimeError(f"{schluessel}.{variante}: Geräusch ist stumm")
    rand = min(int(0.004 * RATE), len(x) // 4)
    x[:rand] *= np.linspace(0, 1, rand)
    x[-rand:] *= np.linspace(1, 0, rand)
    return (x / spitze * 0.9).astype(np.float32)


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    x = erzeuge(sys.argv[1], int(sys.argv[2]))
    with wave.open(sys.argv[3], "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((x * 32767).astype("<i2").tobytes())
    print(f"{sys.argv[1]}.{sys.argv[2]}: {len(x) / RATE:.2f} s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
