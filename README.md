# ABC-Werkstatt

Eine ruhige Schreib-App für Kinder ab etwa drei Jahren, gedacht nach Montessori: Laute hören,
Buchstaben legen, Wörter schreiben. Läuft als installierbare Web-App (PWA) auf dem Handy und
offline, ohne Konto und ohne Werbung.

**Ausprobieren:** <https://kylorin.github.io/abc-werkstatt/> – auf dem Handy über „Zum
Startbildschirm hinzufügen" installieren.

## Bedienung

| Bereich | Was das Kind tut |
|---|---|
| **Freies Schreiben** | Buchstaben aus dem beweglichen Alphabet antippen; jeder Buchstabe erklingt als Laut, ganze Wörter werden vorgelesen. |
| **Nachfüllen** | Ein Wort steht als Vorlage mit leeren Feldern da; das Kind legt die Buchstaben der Reihe nach hinein. |
| **Tiere** | Erscheint, sobald ein Tier-Paket installiert ist: Bild eines Tiers, das Kind schreibt seinen Namen, und das Tier freut sich. |
| **Wörterbuch** (Eltern) | Eigene Übungswörter anlegen und löschen. |
| **Einstellungen** (Eltern) | Buchstabennamen statt Laute, Großbuchstaben, eigener Azure-Schlüssel für neue Wörter, Laut-Studio (Aussprache je Buchstabe wählen oder selbst aufnehmen), Tier-Pakete importieren. |

## Montessori-Grundsätze

- **Laute statt Buchstabennamen** – `m` klingt „mmm", nicht „em". Namen und Großbuchstaben gibt es nur als Einstellung.
- **Kleinbuchstaben** in der Leseanfänger-Schrift **Andika** (SIL, OFL – selbst gehostet).
- **Bewegliches Alphabet:** Vokale blau, Konsonanten rot; Umlaute zählen als Vokale.
- **Fehlerkontrolle im Material:** Ein unpassender Buchstabe wackelt sanft und springt zurück – kein rotes X, kein Fehlerton, keine Punkte.
- **Ruhe:** ein Ding pro Bildschirm, keine Zeitlimits, alles lässt sich antippen und erneut hören.
- Bewusste Ausnahme im Tier-Modus: Das Tier freut sich sichtbar und hörbar – fröhlich, aber ohne Münzen oder Punkte.

## Tier-Pakete

Die App selbst enthält keine Tiere. Ein **Tier-Paket** (Zip mit `paket.json`, Bildern und
optional Ton) wird in den Einstellungen importiert und bleibt nur auf dem Gerät. Das Format
steht in [`docs/tier-paket.md`](docs/tier-paket.md); ein kleines Beispiel mit drei selbst
gezeichneten Tieren liegt unter `tests/fixtures/testpaket.zip` (gebaut von
`tools/testpaket_bauen.mjs`). Persönliche Pakete gehören nicht in dieses Repository.

## Struktur

```
abc-werkstatt/
├── index.html              # Einstieg (Vite)
├── src/
│   ├── main.ts             # Dienste erzeugen, Router starten, Service Worker
│   ├── kern/               # Fundament: vertrag.ts (Typen), Router, Start, Stores, DOM-Helfer, Icons, Stile
│   ├── audio/              # Wiedergabe, vorab vertonte Laute/Wörter, Azure-TTS, Elternaufnahmen
│   ├── paket/              # Tier-Paket-Import und -Speicher (IndexedDB)
│   ├── ui/alphabet.ts      # Bildschirm-Alphabet
│   └── modi/               # je Bildschirm ein Ordner (frei, nachfuellen, tiere, woerterbuch, einstellungen, laut-studio)
├── public/                 # Schrift (Andika), App-Icons, vorab vertonter Audio-Bestand
├── tests/
│   ├── abnahme/            # Playwright-Abnahme (Vertrag über data-testid)
│   └── fixtures/           # Testpaket
├── tools/                  # Hilfsskripte (Icons, Testpaket, Vertonung, Push, CI-Prüfung)
├── docs/                   # Paketformat, frühere Einzeldatei-Version (grundversion.html)
└── .github/workflows/      # CI: Build, Abnahme, Pages-Deploy
```

## Entwicklung

```bash
npm install
npm run dev          # Entwicklungsserver
npm run build        # Typprüfung + Produktionsbuild nach dist/
npm run preview      # gebauten Stand unter http://localhost:4173/abc-werkstatt/ ansehen
npm run testpaket    # tests/fixtures/testpaket.zip neu bauen
```

Vite + TypeScript (strict), ohne Framework. **Richter ist die GitHub-CI:** Jeder Push auf
`main` baut, fährt die Playwright-Abnahme in `tests/abnahme/` und veröffentlicht nur bei Grün
auf GitHub Pages. `tools/ci_gruen.sh [Gruppe …]` wartet auf den Lauf zum aktuellen Commit und
meldet das Ergebnis (ganz oder je Testgruppe).

## Lizenz

Code: MIT. Schrift Andika: SIL Open Font License 1.1 (`public/fonts/OFL.txt`).
