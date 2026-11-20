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

## Optionale Felder für die Spiele (F0)

Das Format bleibt `abc-werkstatt-tierpaket/1`. Alle Felder in diesem Abschnitt sind **optional** –
alte Pakete bleiben gültig. Fehlt ein Feld, spielt das Tier im betreffenden Spiel nicht mit oder
die App lässt den Schritt weg. Unbekannte Felder werden beim Import still verworfen.

```json
{
  "id": "igel", "name": "Igel", "artikel": "der", "bild": "bilder/igel.webp",
  "anlaut": "i",
  "silben": ["i", "gel"],
  "bewegung": "rollt",
  "raetsel": ["Ich habe Stacheln."],
  "situationen": [
    { "id": "igel-apfel", "problem": "Der Igel kommt nicht an den Apfel.", "helfer": "hase",
      "loesung": "Der Hase holt den Apfel herunter.",
      "audio": { "problem": ["audio/igel-apfel-problem.mp3"], "loesung": ["audio/igel-apfel-loesung.mp3"] } }
  ],
  "audio": {
    "name": "audio/igel-name.mp3",
    "anlautName": ["audio/igel-anlautname-1.mp3", "audio/igel-anlautname-2.mp3"],
    "lautRuf": ["audio/igel-lautruf-1.mp3"],
    "silben": ["audio/igel-silbe-1.mp3", "audio/igel-silbe-2.mp3"],
    "raetsel": ["audio/igel-raetsel-1.mp3"]
  }
}
```

Je Tier:

| Feld | Typ | Bedeutung |
|---|---|---|
| `anlaut` | Text, 1–12 Zeichen `a–z ä ö ü ß -` | Gesprochener Anlaut als **Laut**, nicht als erster Buchstabe: ein Buchstabe (`"m"`) oder ein Phonogramm (`"sch"`, `"schp"`, `"scht"`, `"ei"`, `"eu"`, `"au"`, `"pf"`, `"z-stimmhaft"` …). |
| `silben` | Liste, 1–8 Texte | Sprechsilben, von Hand gepflegt (`["i","gel"]`) – so, wie man klatscht. Ohne Feld kein Silben-Hüpfen. |
| `bewegung` | eins von `huepft`, `fliegt`, `kriecht`, `schwimmt`, `rollt`, `klettert`, `watschelt`, `schlaengelt`, `stampft`, `tanzt` | Wie sich das Tier freut. Ohne Feld hüpft es. |
| `raetsel` | Liste, 1–3 Texte | Kurze Sätze **ohne** den Namen („Ich habe Stacheln.“) für „Wer ist unter der Decke?“ |
| `situationen` | Liste, höchstens 20 | Kleine Geschichten, in denen **dieses** Tier ein Problem hat: `{ id, problem, helfer, loesung, audio: { problem, loesung } }`. `helfer` ist die `id` eines **anderen** Tiers im selben Paket, sonst wird das Paket abgelehnt. `id` ist im Paket eindeutig. |
| `audio.anlautName` | mp3-Liste | Name mit gedehntem Anlaut („iiigel“, „{laut_lang} … Igel“) |
| `audio.lautRuf` | mp3-Liste | „{laut} … {tier}!“ – der Laut muss genauso klingen wie der Tastenlaut |
| `audio.ichFange` | mp3-Liste | „Ich fange mit {laut_lang} an!“ |
| `audio.raetsel` | mp3-Liste | je Rätselsatz **eine** Datei, gleiche Reihenfolge und Anzahl wie `raetsel` |
| `audio.ichBin` | mp3-Liste | „Ich bin {artikel} {tier}!“ |
| `audio.silben` | mp3-Liste | je Silbe **eine** Datei, gleiche Anzahl wie `silben`; aus **einer** Aufnahme geschnitten |
| `audio.geschrieben` | mp3-Liste | „Du hast {artikel} {tier} geschrieben!“ |
| `audio.nichtIch` | mp3-Liste | Umlenksatz in „Wer hilft?“ |
| `audio.gaehnen` | mp3-Liste | Gute-Nacht-Satz bzw. Gähnen |
| `audio.geraeusch` | mp3-Liste | Tierlaut (optional, darf in allen Paketen fehlen) |
| `audio.freude` | mp3-Liste | wie bisher, jetzt 3–4 Varianten empfohlen |

Listen sind **Varianten**: die App wählt zufällig, aber nie zweimal hintereinander dieselbe
(Ausnahme `audio.silben` und `audio.raetsel`: dort gehört je Eintrag genau eine Datei dazu).
Jede Audio-Liste hat 1–8 Dateien. Alle Audios eines Pakets sollten in **einem** Lauf mit **einer**
Stimme erzeugt und auf ≈ −16 LUFS normalisiert sein.

### Lautregel für Anlaut-Spiele

Ein Tier nimmt an „Laut ruft Tier“, „Erster Laut“, „Wer ist unter der Decke?“ und am
Anlaut-Schreiben in „Wer hilft?“ **nur** teil, wenn `anlaut` **genau ein Buchstabe** des Alphabets
ist **und** zum ersten Buchstaben des Schreibworts passt. Der Anlaut wird **nie** aus dem Namen
abgeleitet: Ein Tier ohne `anlaut` spielt dort nicht mit, ein „Schaf“ mit `"anlaut": "sch"`
erscheint nie unter „s“. Falsche Laute lehren das Falsche.

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
6. ein referenzierter Pfad (`cover`, `bild`, `audio.*`, `situationen[].audio.*`) im Zip **nicht existiert**,
   absolut ist oder `..` enthält,
7. ein Bild nicht `webp`, `png`, `jpg`/`jpeg` oder `svg` ist (Endung) oder **größer als 2 MB**,
8. eine Audiodatei nicht `mp3` ist oder größer als 2 MB,
9. das Zip entpackt größer als 100 MB ist,
10. ein optionales Feld (`anlaut`, `silben`, `bewegung`, `raetsel`, `situationen`, Audio-Listen) die falsche Form hat, `audio.silben`/`audio.raetsel` nicht genau so viele Dateien wie `silben`/`raetsel` haben oder ein `helfer` nicht im Paket steht.

Dateien im Zip, die `paket.json` nicht referenziert, werden ignoriert und nicht gespeichert.

## Datenschutz

Pakete können persönliche Bilder enthalten. Sie gehören **nicht** ins öffentliche Repository –
nur das Testpaket `tests/fixtures/testpaket.zip` (gebaut von `tools/testpaket_bauen.mjs`)
mit selbst gezeichneten Tieren liegt dort.
