# Tier-Paket – Format Version 1

Ein Tier-Paket bringt Tiere mit Bild (und optional Ton) in die ABC-Werkstatt. Das Kind schreibt
den Namen des Tiers; ist das Wort fertig, freut sich das Tier. Die App selbst ist generisch –
welche Tiere es gibt, steht allein im Paket. Pakete werden in den Einstellungen importiert und
bleiben nur auf dem Gerät (IndexedDB), sie werden nirgends hochgeladen.

## Aufbau

Eine **Zip-Datei** mit `paket.json` **an der Wurzel** und beliebigen Unterordnern für Medien:

```
mein-paket.zip
├── paket.json
├── cover.webp
├── bilder/
│   ├── igel.webp
│   └── baer.png
└── audio/
    ├── igel-name.mp3
    ├── igel-freude-1.mp3
    └── igel-kann.mp3
```

## paket.json

```json
{
  "format": "abc-werkstatt-tierpaket/1",
  "id": "waldtiere",
  "titel": "Waldtiere",
  "untertitel": "Wer wohnt im Wald?",
  "cover": "cover.webp",
  "sprache": "de-DE",
  "tiere": [
    {
      "id": "igel",
      "name": "Igel",
      "artikel": "der",
      "bild": "bilder/igel.webp",
      "kann": "Der Igel kann sich ganz rund machen.",
      "freude": "Juhu, du hast mich geschrieben!",
      "audio": {
        "name": "audio/igel-name.mp3",
        "freude": ["audio/igel-freude-1.mp3"],
        "kann": "audio/igel-kann.mp3"
      }
    },
    { "id": "baer", "name": "Bär", "artikel": "der", "bild": "bilder/baer.png" }
  ]
}
```

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `format` | ja | genau `abc-werkstatt-tierpaket/1` |
| `id` | ja | `[a-z0-9-]+`, 1–40 Zeichen. Ein erneuter Import mit gleicher `id` **ersetzt** das Paket. |
| `titel` | ja | Name des Pakets, steht groß auf der Startseite (1–40 Zeichen) |
| `untertitel` | nein | kleine Zeile unter dem Titel (1–300 Zeichen) |
| `cover` | nein | Coverbild für die Startkachel (Pfad im Zip) |
| `sprache` | ja | `de-DE` |
| `tiere` | ja | 1 bis 200 Tiere |

Je Tier:

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | `[a-z0-9-]+`, 1–40 Zeichen, eindeutig im Paket |
| `name` | ja | Anzeigename mit Großbuchstaben und Umlauten, z. B. `Bär` |
| `artikel` | ja | `der`, `die` oder `das` |
| `bild` | ja | Bild im Zip |
| `kann` | nein | Satz, was das Tier kann (wird vorgelesen, 1–300 Zeichen) |
| `freude` | nein | Satz, den das Tier sagt, wenn sein Name geschrieben ist (1–300 Zeichen) |
| `audio.name` | nein | mp3 mit dem gesprochenen Namen |
| `audio.freude` | nein | Liste von mp3s; bei Erfolg wird eine zufällig gespielt (sonst wird `freude` vorgelesen) |
| `audio.kann` | nein | mp3 mit dem `kann`-Satz; ohne sie liest die App `kann` mit der eingestellten Stimme vor. Wer Name und Freude vertont, sollte auch `kann` vertonen, sonst wechselt mitten in der Freude die Stimme. |

## Bilder

Die App zeigt jedes Tierbild **rund** (Kreis mit hellem Rand) und zoomt dabei etwa 8 % heran.
Ecken und ein schmaler Rand des Bildes sind also nie zu sehen. Das Tier sollte mittig stehen und
gut die Hälfte des Bildes füllen, sonst ist es auf dem Handy kaum zu erkennen. Quadratische
Bilder ab 512 × 512 px sind ideal.

## Schreibwort

Das Wort, das das Kind schreibt, ist **kanonisch klein**:
`name.toLocaleLowerCase('de-DE')` – aus `Bär` wird `bär`, aus `Igel` wird `igel`.
Es darf nur Buchstaben des beweglichen Alphabets enthalten (`a`–`z`, `ä`, `ö`, `ü`, `ß`),
2 bis 20 Zeichen. Namen mit Leerzeichen, Bindestrich oder Ziffern sind ungültig.
Kommt dasselbe Schreibwort in mehreren installierten Paketen vor, gewinnt beim freien
Schreiben das zuletzt installierte Paket.

## Validierung beim Import

Der Import lehnt das ganze Paket mit einer verständlichen Meldung ab (es wird nichts
halb gespeichert), wenn:

1. die Datei kein gültiges Zip ist oder `paket.json` nicht an der Wurzel liegt bzw. kein gültiges JSON ist,
2. `format` nicht genau `abc-werkstatt-tierpaket/1` ist oder `sprache` nicht `de-DE`,
3. ein Pflichtfeld fehlt oder den falschen Typ hat, eine `id` nicht dem Muster entspricht
   oder Tier-`id`s doppelt sind,
4. mehr als **200 Tiere** enthalten sind oder keines,
5. ein Schreibwort ungültig ist (siehe oben) oder zwei Tiere dasselbe Schreibwort haben,
6. ein referenzierter Pfad (`cover`, `bild`, `audio.*`) im Zip **nicht existiert**,
   absolut ist oder `..` enthält,
7. ein Bild nicht `webp`, `png`, `jpg`/`jpeg` oder `svg` ist (Endung) oder **größer als 2 MB**,
8. eine Audiodatei nicht `mp3` ist oder größer als 2 MB,
9. das Zip entpackt größer als 100 MB ist.

Dateien im Zip, die `paket.json` nicht referenziert, werden ignoriert und nicht gespeichert.

## Datenschutz

Pakete können persönliche Bilder enthalten. Sie gehören **nicht** ins öffentliche Repository –
nur das Testpaket `tests/fixtures/testpaket.zip` (gebaut von `tools/testpaket_bauen.mjs`)
mit selbst gezeichneten Tieren liegt dort.
