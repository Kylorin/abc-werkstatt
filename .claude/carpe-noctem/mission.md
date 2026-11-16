---
titel: ABC-Werkstatt — Montessori-Schreib-App als PWA
deadline: 07:00
geschuetzt: tests/abnahme/**, playwright.config.ts, .github/workflows/**, tools/ci_gruen.sh, tools/abnahme_gruppe.py
richter_default: bash tools/ci_gruen.sh
kanal: md
datenschutz: privat
max_continuations: 200
hardening_rounds_max: 3
---

# Auftrag

Die Grundversion (`index.html`, eine Datei) wird zu einer eleganten, handytauglichen **PWA** für ein Kind
von knapp 3 Jahren ausgebaut, nach **Montessori**: Das Kind lernt Laute und schreibt erste Wörter mit einem
großen beweglichen Alphabet. Drei Modi (Freies Schreiben, Nachfüllen, Wörterbuch) plus Einstellungen. Alle
Laute, Buchstabennamen und Startwörter werden **vorab mit Azure Speech vertont** (neuronale deutsche
Stimmen, Region Frankfurt). Morgens läuft die App unter https://kylorin.github.io/abc-werkstatt/ und lässt
sich aufs Handy installieren. Der Richter ist die Playwright-Abnahme in `tests/abnahme/` und läuft
**ausschließlich in GitHub Actions** (keine lokalen Testläufe, keine parallelen Builds aus Subagenten).

## Pädagogische Leitplanken (Montessori) — verbindlich

- **Laute statt Buchstabennamen** (m = „mmm“, nicht „Em“). Namen und Großbuchstaben sind nur als Einstellung da.
- **Kleinbuchstaben** als Standard, klare Druckschrift (Andika oder vergleichbare Leseanfänger-Schrift, selbst gehostet).
- **Farbcode des beweglichen Alphabets**: Vokale blau, Konsonanten rot (gedämpfte, edle Töne, nicht grell).
- **Fehlerkontrolle liegt im Material**: Ein falscher Buchstabe springt sanft zurück, es gibt kein rotes X,
  keinen Fehlerton und keine Strafe. Das Kind korrigiert sich selbst.
- **Keine extrinsische Belohnung**: keine Punkte, Sterne, Ranglisten oder Konfetti-Flut. Bei einem fertigen
  Wort ruhige Bestätigung: das Wort wird ganz vorgelesen und kurz hervorgehoben, dann kommt das nächste.
- **Reduziert und ruhig**: ein Ding pro Bildschirm, keine Werbung, keine Ablenkung, keine Zeitlimits.
- **Isolation der Schwierigkeit**: Nachfüllen zeigt das Wort als Vorlage (Schattenbuchstaben im Slot),
  das Alphabet bietet die Buchstaben des Worts plus wenige Ablenker.
- **Wiederholung erlaubt**: Wort und Laut jederzeit erneut anhören (Antippen).
- **Startwortschatz lautgetreu und kurz** (≥ 20 Wörter): z. B. mama, papa, oma, opa, auto, ball, mond,
  hund, nase, sofa, igel, ente, eis, rad, maus, baum, sonne, tomate, lama, kuh, hut. Keine Personennamen.

## Technik — Vorgaben

- Vite + TypeScript, `base: '/abc-werkstatt/'`, Skripte `build` und `preview` (die Playwright-Konfiguration
  ruft `npm run preview -- --port 4173`). `package-lock.json` committen, `npm ci` muss laufen.
- PWA: Manifest (`display: standalone`, Icons 192 und 512), Service Worker (z. B. `vite-plugin-pwa`), offline nutzbar.
- Icons als **SVG** (eigene oder z. B. Lucide, MIT), keine Emojis in Bedienelementen.
- Vertrag mit den Tests über `data-testid` — siehe `tests/abnahme/abnahme.spec.ts` (nicht ändern).
- Audio: `tools/vertonen.py` (Python, UTF-8, SSML) erzeugt `public/audio/{laute,namen,woerter}/…mp3` und
  `public/audio/manifest.json` (`{laute:{b:url}, namen:{b:url}, woerter:{wort:url}, varianten:{b:[url…]}}`).
  Schlüssel kommt aus `tools/.lokal/schluessel.sh` (gitignored, setzt `AZURE_SPEECH_KEY`/`AZURE_SPEECH_REGION`).
  Für Laute **mehrere Varianten** je Buchstabe (verschiedene Stimmen/IPA-Formen), Auswahl im Laut-Studio.
  Bekannt: `<phoneme>` geht nicht mit `*MultilingualNeural`-Stimmen; `ː` scheiterte über Git-Bash (Kodierung),
  deshalb SSML aus Python senden.
- Neue Wörter aus dem Wörterbuch: (1) Elternaufnahme per MediaRecorder (IndexedDB), (2) eigener Azure-Schlüssel
  aus den Einstellungen (nur auf dem Gerät, `localStorage`, live TTS + Cache), (3) Browserstimme als letzte Stufe.
- Freies Schreiben behält die Spracheingabe (Web Speech API) aus der Grundversion.
- Wörterbuch und Einstellungen nur auf dem Gerät (localStorage/IndexedDB). Ein Kindername nur als Einstellung.

## Git

- Arbeiten auf `main`, kleine Commits, **Push auf `origin/main` ist freigegeben** (Repo Kylorin/abc-werkstatt,
  öffentlich). Push immer so: `bash tools/push.sh` (Kylorin-Token je Aufruf).
- **Nie** `gh auth switch` — aktiver gh-Account bleibt NeuraMax. Lokale Identity ist Kylorin (schon gesetzt).
- Branch `richter-probe` war die Prüfung der Richter-Kette, nicht anfassen.

# Nicht-Ziele

- Kein eigener Server, kein Backend, kein Deploy außer GitHub Pages über die CI.
- Keine Accounts, kein Tracking, keine Analytics, keine externen Schriften/CDNs zur Laufzeit.
- Keine Handschrift-/Nachspur-Übungen (Sandpapierbuchstaben digital) — Backlog.

# Arbeitspakete

- [ ] A1 — Gerüst + Startseite :: fertig wenn: Vite/TS-Projekt mit `build`/`preview`, Startseite mit den vier
      Einträgen als SVG-Icons, ruhiges elegantes Design (Farbtokens, Andika selbst gehostet), CI baut.
      prüfen: bash tools/ci_gruen.sh "Start und Navigation"
- [ ] A2 — Vertonung :: fertig wenn: `tools/vertonen.py` erzeugt Laute (≥ 2 Varianten je Buchstabe), Namen,
      ≥ 20 Startwörter und `manifest.json` unter `public/audio/`, alles committet.
      nach: A1
      prüfen: bash tools/ci_gruen.sh "Audio-Bestand"
- [ ] A3 — Freies Schreiben :: fertig wenn: bewegliches Alphabet am Bildschirm (Vokale blau, Konsonanten rot),
      Tastatur, Laut beim Antippen, Leerzeichen liest Wort, Spracheingabe bleibt.
      nach: A2
      prüfen: bash tools/ci_gruen.sh "Freies Schreiben (bewegliches Alphabet)"
- [ ] A4 — Wörterbuch :: fertig wenn: Wörter hinzufügen/löschen, bleibt nach Neuladen, Startwortschatz vorbelegt.
      nach: A1
      prüfen: bash tools/ci_gruen.sh "Wörterbuch"
- [ ] A5 — Nachfüllen :: fertig wenn: Wort als Vorlage, Slots, falscher Buchstabe springt sanft zurück, fertiges
      Wort wird ganz vorgelesen, nächstes Wort kommt.
      nach: A2, A4
      prüfen: bash tools/ci_gruen.sh "Nachfüllen"
- [ ] A6 — Einstellungen + Laut-Studio :: fertig wenn: Namen/Großbuchstaben umschaltbar, Feld für eigenen
      Azure-Schlüssel (live TTS mit Cache), Laut-Studio mit Varianten zum Anhören und Auswählen, Elternaufnahme
      für Laute und Wörter.
      nach: A2, A3
      prüfen: bash tools/ci_gruen.sh "Einstellungen"
- [ ] A7 — Handy, PWA, Datenschutz :: fertig wenn: installierbar, offline, kein horizontales Scrollen, Tasten
      ≥ 44 px, kein Kindername und kein Schlüssel im Repo.
      nach: A3
      prüfen: bash tools/ci_gruen.sh "Handy und PWA" "Datenschutz im Repo"
- [ ] A8 — Gesamtabnahme + Doku :: fertig wenn: ganze Abnahme grün, Pages deployt, README beschreibt Bedienung,
      Montessori-Leitplanken, Vertonung und Struktur; `index.html` der Grundversion ersetzt.
      nach: A1, A2, A3, A4, A5, A6, A7
      prüfen: bash tools/ci_gruen.sh

# Grenzen

- G1 [A2] extern: Azure Speech (Foundry-Schlüssel thecluster) für die Vertonung
      probe: bash tools/speech_probe.sh
- G2 [A1] freigabe: Push auf origin/main als Kylorin
      probe: bash tools/push_probe.sh
- G3 [A1] extern: GitHub Actions + Pages auf Kylorin/abc-werkstatt
      probe: curl -s -o /dev/null -w "%{http_code}" https://kylorin.github.io/abc-werkstatt/ | grep -q 200
- G4 [A6] urteil: Klangqualität der isolierten Laute (b, d, k, g, p, t) — nur per Hörprobe beurteilbar
- G5 [A4] urteil: Startwortschatz

# Pre-mortem

- Die Nacht lief in der falschen Session/im falschen Repo und band sich nicht (Stop-Hook bindet an die erste stoppende Session im Repo)
- Richter-Kette war kaputt (Artefakt-Name, JSON-Pfad) und schreibgeschützt, kein Paket konnte grün werden
- Azure-Laute klingen wie „be“ statt „b“ — Varianten + Laut-Studio + Elternaufnahme, Urteil morgen
- `npm ci` scheitert in CI an fehlendem/inkonsistentem Lockfile
- Schlüssel landet im öffentlichen Repo (vertonen.py loggt Header) — Datenschutz-Test + nur Env-Variablen
- Spracheingabe/Mikrofon ist in CI nicht testbar — manueller Morgentest als To-Do

# Verbotene Aktionen

- Externe Kommunikation, `gh auth switch`, Force-Push, Löschen von Repos/Branches, Änderungen an Infisical
- Kindername oder Schlüssel in Dateien im Repo
- Lokale Playwright-/Gesamttestläufe (Richter ist die CI)

# Härtungs-Backlog

- Bildkarten (SVG) zu den Startwörtern
- Sandpapierbuchstaben digital (Nachspuren)
- Silbenmodus, Anlaut-Spiel („Was fängt mit mmm an?“)
- Barrierefreiheit (Fokus, Kontrast), Ton-Lautstärke, Bildschirm wach halten (Wake Lock)
