# ABC-Werkstatt

Kleine Schreib-App für Kleinkinder (ab ca. 3): riesige bunte Buchstaben, jede Taste wird laut gesagt,
Wörter werden vorgelesen, und über das Mikrofon kann das Kind sprechen – das Gesagte erscheint als Text.

## Starten

`index.html` in **Microsoft Edge** öffnen (Doppelklick oder `start msedge index.html`).
Edge hat die schönsten deutschen Stimmen („Katja/Amala Online (Natural)“). Chrome geht auch.
Beim ersten Klick auf 🎤 fragt der Browser nach dem Mikrofon – erlauben.

## Bedienung

| Aktion | Wirkung |
|---|---|
| Buchstabe/Ziffer tippen | erscheint groß, wird gesagt („Be“, „Zett“ …) |
| Leertaste | letztes Wort wird vorgelesen |
| Enter / 🔊 | ganzer Text wird vorgelesen |
| ⌫ | letztes Zeichen weg |
| 🎤 | sprechen → Text erscheint und wird wiederholt |
| 🧹 | alles löschen |
| ⛶ | Vollbild + Tastatursperre (Esc **lange** halten zum Verlassen) |

## Technik

Eine einzige HTML-Datei ohne Build und ohne API-Key. Vorlesen über die Web Speech API
(`speechSynthesis`), Spracheingabe über `SpeechRecognition` (die Erkennung läuft beim
Browser-Hersteller in der Cloud, deshalb nur mit Internet). Schrift: Andika (Google Fonts,
für Leseanfänger gemacht). Gehaltene Tasten erzeugen keine Buchstabenschlange.

## Struktur

```
abc-werkstatt/
├── index.html   # die ganze App
└── README.md
```
