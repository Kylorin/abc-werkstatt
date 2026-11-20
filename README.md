# ABC-Werkstatt

Eine ruhige Schreib-App für Kinder ab etwa drei Jahren, gedacht nach Montessori: Laute hören,
Buchstaben legen, Wörter schreiben. Läuft als installierbare Web-App (PWA) auf dem Handy und
offline, ohne Konto und ohne Werbung.

**Ausprobieren:** <https://kylorin.github.io/abc-werkstatt/> – auf dem Handy über „Zum
Startbildschirm hinzufügen" installieren.

## Bedienung

Der Start ist ein **Regal** mit höchstens vier großen Bildkacheln – genau die Arbeiten, die Eltern
im Elternbereich hineingestellt haben. Ein erster Tipp sagt, was die Kachel ist, ein zweiter Tipp
(oder Halten) öffnet sie. In den Arbeiten des Kindes braucht „Zurück" eine Sekunde Halten, das
Zurück des Handys wird abgefangen und der Bildschirm bleibt an. Neue Arbeiten (Laut ruft Tier,
Wer ist unter der Decke?, Silben-Hüpfen, Wer hilft?, Meine Leute) beschreibt
[`docs/konzept-spass-und-lernen.md`](docs/konzept-spass-und-lernen.md); sie entstehen gerade.

| Bereich | Was das Kind tut |
|---|---|
| **Freies Schreiben** | Buchstaben aus dem beweglichen Alphabet antippen; jeder Buchstabe erklingt als Laut, ganze Wörter werden vorgelesen. Der Text bleibt beim Verlassen erhalten, „Alles wegräumen" lässt sich zurückholen. |
| **Nachfüllen** | Ein lautgetreues Wort steht als Vorlage mit leeren Feldern da; das Kind legt die Buchstaben der Reihe nach hinein. Leichte Wörter kommen öfter dran als schwere. |
| **Tiere** | Erscheint, sobald ein Tier-Paket installiert ist: Bild eines Tiers, das Kind schreibt seinen Namen, und das Tier freut sich. Es geht beim nächsten Mal beim nächsten Tier weiter. |
| **Wörterbuch** (Eltern, leise im Fuß des Starts) | Eigene Übungswörter anlegen, fürs Üben an-/abwählen und löschen (das zuletzt gelöschte Wort lässt sich zurückholen). |
| **Einstellungen** (Eltern, leise im Fuß des Starts) | Regal, Lernpfad (Tier-Stufe, Hilfe, Gute Nacht, Laut ruft Tier), Anfangsbuchstabe des Kindes und „heute dran", Live-Stimme für frei Geschriebenes (Gerät, Offline-Stimme oder OpenRouter mit eigenem Schlüssel) und Spracheingabe für Eltern, Buchstabennamen statt Laute, Großbuchstaben, Laut-Studio (Aussprache je Buchstabe wählen oder selbst aufnehmen), Tier-Pakete importieren und löschen (zurückholbar bis zum nächsten Löschen/Import), Speicherstand. |

## Montessori-Grundsätze

- **Laute statt Buchstabennamen** – `m` klingt „mmm", nicht „em". Namen und Großbuchstaben gibt es nur als Einstellung.
- **Kleinbuchstaben** in der Leseanfänger-Schrift **Andika** (SIL, OFL – selbst gehostet).
- **Bewegliches Alphabet:** Vokale blau, Konsonanten rot; Umlaute zählen als Vokale.
- **Lautgetreue Startwörter:** Die Laute der Buchstaben ergeben das Wort (oma, sofa, igel …); Phonogramme wie sch, ei, au kommen später.
- **Fehlerkontrolle im Material:** Ein unpassender Buchstabe klingt mit seinem Laut, wackelt sanft und springt zurück – kein rotes X, kein Fehlerton, keine Punkte. Nach drei Versuchen klingt der gesuchte Laut.
- **Ruhe:** ein Ding pro Bildschirm, keine Zeitlimits, alles lässt sich antippen und erneut hören. Nach einem geschafften Wort geht es erst weiter, wenn zu Ende gesprochen ist.
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
│   ├── audio/              # Wiedergabe, feste Sätze aus Dateien, Live-Stimme (Browser/Piper/OpenRouter), Elternaufnahmen
│   ├── paket/              # Tier-Paket-Import und -Speicher (IndexedDB)
│   ├── ui/alphabet.{ts,css} # Bildschirm-Alphabet (bewegliches Alphabet)
│   └── modi/               # je Bildschirm ein Ordner (frei, nachfuellen, tiere, laut-ruft-tier, decke, silben, geschichten, leute, woerterbuch, einstellungen, laut-studio)
├── public/                 # Schrift (Andika), App-Icons, vorab vertonter Audio-Bestand
├── tests/
│   ├── abnahme/            # Playwright-Abnahme (Vertrag über data-testid)
│   └── fixtures/           # Testpaket
├── tools/                  # Hilfsskripte (Icons, Testpaket, Vertonung, Push, CI-Prüfung)
├── docs/                   # Paketformat, Bau-Spezifikation (konzept-spass-und-lernen.md), frühere Einzeldatei-Version
└── .github/workflows/      # CI: Build, Abnahme, Pages-Deploy
```

## Entwicklung

```bash
npm install
npm run dev          # Entwicklungsserver
npm run build        # Typprüfung + Produktionsbuild nach dist/
npm run preview      # gebauten Stand unter http://localhost:4173/abc-werkstatt/ ansehen
npm run testpaket    # tests/fixtures/testpaket.zip neu bauen
python tools/vertonen.py …   # feste Wörter und Sätze in public/audio vertonen (wird gerade auf Piper lokal / gpt-audio umgestellt, siehe unten)
python tools/laute_ki.py alles [--lauf haupt] [--nur m,b,k,a]   # Laute per Sprachmodell erzeugen + von Hör-Modellen bewerten (OpenRouter-Schlüssel aus .env, gitignored; Rohdaten + Hörseite unter tools/.lokal/laute-roh/)
python tools/laute_ki.py namen [--nur b,c]   # Buchstabennamen (A, Be, Ze …) ebenso erzeugen + bewerten, Lauf tools/.lokal/laute-roh/namen/
```

Vite + TypeScript (strict), ohne Framework. **Richter ist die GitHub-CI:** Jeder Push auf
`main` baut, fährt die Playwright-Abnahme in `tests/abnahme/` und veröffentlicht nur bei Grün
auf GitHub Pages. `tools/ci_gruen.sh [Gruppe …]` wartet auf den Lauf zum aktuellen Commit und
meldet das Ergebnis (ganz oder je Testgruppe).

**Datenschutz-Abnahme:** Die privaten Begriffe, die nie ins Repo dürfen, stehen nicht im Code,
sondern im Actions-Secret `VERBOTENE_BEGRIFFE` bzw. lokal in `tools/.lokal/verboten.txt`
(gitignored, ein regulärer Ausdruck je Zeile). Fehlt die Liste, ist die Abnahme rot. Geprüft
werden der Arbeitsbaum und alle neuen Commits (CI checkt mit voller Historie aus).

## Vertonung

Der Ton liegt fertig unter `public/audio/` und ist in `public/audio/manifest.json` verzeichnet
(Pfade relativ zur App-Basis). Er stammt aus zwei Werkzeugen:

| Was | Woher | Werkzeug |
|---|---|---|
| **Laute** `laute/<b>.ki1.mp3` (Standard) und `.ki2.mp3` (zweite Variante im Laut-Studio) | Sprachmodell gpt-audio über OpenRouter, bewertet von drei Hör-Modellen | `tools/laute_ki.py` |
| **Buchstabennamen** `namen/<b>.mp3` („Be“, „Zett“) | ebenso | `tools/laute_ki.py namen` |
| **Wörter, feste Sätze, Geräusche** `woerter/`, `saetze/`, gedehnte Laute `laute_lang` | lokal und kostenlos mit Piper (Stimme de_DE-thorsten-high); später in einem Lauf mit gpt-audio ersetzbar | `tools/vertonen.py` |

`tools/laute_ki.py` erzeugt je Buchstabe mehrere Kandidaten mit einer Montessori-Vorgabe (Anlaut,
Dauerlaute gedehnt, Verschlusslaute ohne Vokal), schneidet und normalisiert sie und lässt jeden
Kandidaten von drei Hör-Modellen zweistufig bewerten (erst blind, dann gegen die Vorgabe). Gewählt
werden die zwei besten gültigen Kandidaten; alle Rohdaten und eine Hörseite liegen gitignored unter
`tools/.lokal/laute-roh/<lauf>/`. Die Übernahme nach `public/audio/` ist ein bewusster Schritt
nach dem Anhören. `tools/vertonen.py` fasst Laute und Namen nicht an: Es übernimmt deren
Manifest-Einträge unverändert und prüft nur, dass die Dateien vorhanden sind.

Wer im Laut-Studio eine Variante gewählt hat, die es nicht mehr gibt (frühere Dateinamen), fällt
beim nächsten Start still auf die neue Standard-Aussprache zurück; eigene Aufnahmen bleiben.

**Feste Sätze** (Ton-Gesamtliste im Konzept, Abschnitt 6a) stehen in `manifest.saetze` als
Schlüssel → Liste von Varianten, z. B. `"kachel.tiere": ["audio/saetze/kachel.tiere.1.mp3", …]`.
Die App spielt sie nur aus diesen Dateien und nie zweimal dieselbe Variante hintereinander; fehlt
eine, ist das ein sichtbarer Fehler. **Live** gesprochen wird nur frei Geschriebenes – mit der
Stimme des Geräts, offline mit Piper (wird beim ersten Wählen geladen) oder über OpenRouter mit
dem eigenen Schlüssel der Eltern.

- **Offline-Stimme (Piper):** `src/audio/piper.ts` lädt beim ersten Wählen einmalig ≈ 93 MB
  (ONNX Runtime Web und Piper-Phonemizer von jsDelivr, Stimme `de_DE-thorsten-medium` von
  Hugging Face), alles fest gepinnt und per SHA-256 geprüft, in einen eigenen Cache. Der Motor
  (`src/audio/piper-motor.ts`) wird erst beim Sprechen per `import()` geladen und steht nicht im
  PWA-Precache (`vite.config.ts`, `globIgnores`). Ohne Download gibt es eine klare Meldung.
- **OpenRouter live:** `openai/gpt-audio-mini`, Antwort als Stream (PCM16, 24 kHz) → WAV. Jedes
  Wort wird je Stimme nur einmal erzeugt und danach aus dem Cache gespielt.
- **Spracheingabe** (nur wenn Eltern sie einschalten): Browser (Web Speech) oder OpenRouter
  (Aufnahme → 16-kHz-WAV → `google/gemini-2.5-flash` schreibt auf). Baustein: `src/audio/spracheingabe.ts`.

## Lizenz

Code: MIT. Schrift Andika: SIL Open Font License 1.1 (`public/fonts/OFL.txt`).
