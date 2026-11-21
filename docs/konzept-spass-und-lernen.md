# Konzept: Spaß und Lernen für die Jüngsten (ab knapp 3 Jahren)

> Bau-Spezifikation für den nächsten Ausbau der ABC-Werkstatt. Grundlage: fünf Entwürfe
> (Montessori, Spieldesign, Sprachförderung, Tier-Fan, Handy-Bedienung) und drei Jurys
> (Kind, Machbarkeit, Eltern). Alles Serienspezifische (Tiere, Bilder, Geschichten) bleibt im
> privaten **Tier-Paket**. Die App kennt nur generische Felder. Der Name des Kindes erscheint
> nie im Repo, gespeichert wird lokal höchstens sein Anfangsbuchstabe.

---

## 1. Leitidee

Ein Kind von knapp drei Jahren schreibt noch keine Wörter. Es **hört Laute**, liebt Ursache und
Wirkung und will seine Lieblingstiere sehen. Deshalb **ruft ein Laut ein Tier herbei**: Jede
Berührung klingt sofort, jedes Tier hat seinen Anlaut, und geschrieben wird zuerst nur der
**erste Buchstabe**, bis das Kind von sich aus mehr will. Die Tiere sind keine Belohnung,
die man sich verdient. Sie sind Freunde, die der Buchstabe ruft. Es gibt keine Punkte und kein Scheitern,
jede Runde geht gut aus, und Papa sitzt daneben und freut sich mit.

---

## 2. Lernpfad

Fünf Stufen, von „Laute entdecken“ bis „eigene Wörter schreiben“. **Die App steigert nie
selbst.** Papa wählt im Elternbereich, welche Arbeiten im „Regal“ (Startseite) stehen und auf
welcher Stufe der Tier-Modus arbeitet. Das Kind wählt frei aus dem Regal, wiederholt so oft es
will und kann jederzeit auf eine leichtere Arbeit zurück. Fortschritt sieht nur Papa, und zwar
als Gesprächsanlass („heute dran: m, a, Igel“), nie als Zahl für das Kind.

| Stufe | Name | Was das Kind tut | Arbeiten im Regal | Lernschritt |
|---|---|---|---|---|
| **A** | Hören | Silben eines Tiernamens antippen, Tier unter der Decke an Hinweisen erraten | Silben-Hüpfen, Wer ist unter der Decke? (Stufe 0, nur Bilder) | Silben, Anlaut hören (phonologische Bewusstheit) |
| **B** | Laut ↔ Zeichen | Beliebigen Buchstaben antippen → Laut + Tier mit genau diesem Anlaut | Laut ruft Tier (Freies Schreiben mit wenigen Tasten) | Ein Zeichen hat einen Laut und ein Ankertier |
| **C** | Erster Buchstabe | Bei Tier/Geschichte/Familienwort nur den Anlaut aus 2–3 Tasten legen, der Rest füllt sich gedehnt selbst | Tiere (Stufe 1), Wer hilft?, Meine Leute | Anlaut → Buchstabe, erstes „Ich hab geschrieben“ |
| **D** | Rahmen | Anlaut und Endlaut legen, später das ganze Wort mit Vorlage und kleiner Auswahl | Tiere (Stufe 2/3), Nachfüllen | Lautfolge von links nach rechts |
| **E** | Eigene Wörter | Volles Alphabet, freies Schreiben, eigene Wörter im Wörterbuch | Freies Schreiben (volles Alphabet), Tiere (Stufe 4) | Schreiben aus dem Kopf |

**Sanft hindurchführen, ohne Punkte:**

- **Regal statt Menü:** höchstens 3–4 große Bildkacheln für das Kind. Was Papa noch nicht
  freigegeben hat, steht nicht im Regal. Es ist nicht ausgegraut oder gesperrt, es fehlt einfach. So greift das Kind nicht
  zum Schwersten.
- **Leichtes zuerst, aber Kind führt:** Innerhalb einer Arbeit bietet die App leichte, lautreine
  Tiere öfter an. Das Kind wählt trotzdem frei (Tier-Wiese), auch zum zehnten Mal dasselbe.
- **Hilfe kommt vom Material:** Nach dem 2. Fehlversuch leuchtet die gesuchte Taste und das
  Tier sagt den Laut selbst. Mit 2–3 Tasten führt das immer zum Erfolg.
- **Elternhinweis statt Automatik:** Hat das Kind eine Stufe an mehreren Tagen mühelos gespielt
  (z. B. Anlaut beim ersten Tipp), zeigt der Elternbereich einen leisen Vorschlag
  („Stufe 2 ausprobieren?“). Umgestellt wird nur durch Papa.
- **Gutes Ende:** Nach einer einstellbaren Zahl von Runden (Standard 6, kein sichtbarer Zähler,
  kein Timer) gähnen die Tiere und kuscheln sich auf die Decke. Antippen weckt sie wieder,
  aufhören fällt aber leicht.

---

## 3. Features für diesen Bau

Auswahl nach Jury-Mittel (Kind / Machbarkeit / Eltern), Dubletten zusammengelegt, Machbarkeit
beachtet. Reihenfolge = Bau-Reihenfolge. **F0 ist kein Kind-Feature, trägt aber alle anderen.**

| # | Feature | Jury-Mittel | Aufwand |
|---|---|---|---|
| F0 | Tier-Paket: optionale Felder (`anlaut`, `silben`, `bewegung`, `situationen`, Audio) | – (Voraussetzung) | mittel |
| F1 | Erster Laut: Stufen im Tier-Modus + Tier-Wiese + Weiter-Knopf | 8,7 | klein–mittel |
| F2 | Laut ruft Tier (Anlaut-Tier bei jedem Buchstaben) | 8,8 | klein–mittel |
| F3 | Wer ist unter der Decke? (Lausch-Versteck mit Hilfeleiter) | 8,3 | mittel |
| F4 | Tiere mit Persönlichkeit (Bewegung je Tier) | 8,0 | klein |
| F5 | Silben-Hüpfen | 8,0 | mittel |
| F6 | Wer hilft? (Geschichten aus dem Paket) | 7,8 | mittel–groß |
| F7 | Meine Leute (Familienwörter mit Elternstimme, nur lokal) | 8,0 | mittel |

Bewusst **nicht in diesem Bau** (zweite Welle): Spur-Buchstabe/Sandpapier (Strichpfade je
Buchstabe und schleifbarer Dauerlaut sind neue Infrastruktur, Lerneffekt mit knapp 3 begrenzt),
Reim-Quatsch (eigene Ding-Bilder nötig), Papa-Brief (Teilen nach außen, eher Vater-Werkzeug).

### Platzhalter in Tonlisten

| Platzhalter | Bedeutung | Beispiel |
|---|---|---|
| `{laut}` | der **Laut**, nie der Name. Dauerlaute gedehnt (≈ 1–1,5 s), Plosive kurz und ohne Schwa | „mmm“, „sss“, „b“ (nicht „be“) |
| `{laut_lang}` | gedehnte Fassung für Hörspiele (Dauerlaute ≈ 2 s, Plosive 2–3× kurz: „b-b-b“) | „mmmmm“ |
| `{tier}` | Name des Tiers wie im Paket | „Igel“ |
| `{artikel}` | `der`/`die`/`das`, groß am Satzanfang: `{Artikel}` | „der“ |
| `{tier_gedehnt}` | Name mit gedehntem Anlaut | „iiigel“ |
| `{wort}` | frei geschriebenes oder Familienwort (live bzw. Elternaufnahme) | „oma“ |
| `{silbe}` | eine Sprechsilbe | „i“, „gel“ |

Regel für alle Varianten: Beim Abspielen wird zufällig gewählt, **aber nie dieselbe Variante
zweimal hintereinander**. Varianten sind gleich warm und gleich lang. Kein Satz klingt nach
Prüfung.

---

### F0 – Tier-Paket: optionale Felder (Format bleibt `/1`)

**Verhalten im Detail**

- Das Format bleibt `abc-werkstatt-tierpaket/1`. Alle neuen Felder sind **optional**, alte
  Pakete bleiben gültig (der Validator vergleicht das Format exakt, ein `/2` würde alte Pakete
  ablehnen).
- `pruefePaketJson` in `src/paket/validierung.ts` baut heute eine **bereinigte** Fassung und
  lässt unbekannte Felder still fallen. Jedes neue Feld muss dort geprüft **und übernommen**
  werden, `referenzierteDateien` muss alle neuen Audio-Pfade kennen (sonst werden die Dateien
  beim Import nicht gespeichert).
- Neue Felder je Tier:

| Feld | Typ | Bedeutung |
|---|---|---|
| `anlaut` | Zeichenkette | gesprochener Anlaut als **Laut**, nicht als erster Buchstabe: ein Buchstabe des Alphabets (`"m"`) oder ein Phonogramm (`"sch"`, `"schp"`, `"scht"`, `"ei"`, `"eu"`, `"au"`, `"pf"`, `"z-stimmhaft"` …). Nur Tiere, deren `anlaut` **genau ein Buchstabe des Alphabets ist und zum ersten Buchstaben des Schreibworts passt**, nehmen an Anlaut-Spielen teil. Fehlt das Feld, nimmt das Tier an Anlaut-Spielen **nicht** teil (nie aus `name[0]` ableiten). |
| `silben` | Liste von Zeichenketten | Sprechsilben, von Hand gepflegt (`["i","gel"]`). Ohne Feld kein Silben-Hüpfen für dieses Tier. |
| `bewegung` | Aufzählung | `huepft`, `fliegt`, `kriecht`, `schwimmt`, `rollt`, `klettert`, `watschelt`, `schlaengelt`, `stampft`, `tanzt` |
| `raetsel` | Liste von Zeichenketten | 1–3 kurze Sätze ohne den Namen („Ich habe Stacheln.“) für F3 |
| `situationen` | Liste | `{ id, problem, helfer (Tier-id im selben Paket), loesung, audio: { problem, loesung } }` für F6. Situationen ohne Helfer-Tier im Paket gehören nicht hinein. |
| `audio.anlautName` | mp3-Liste | Name mit gedehntem Anlaut |
| `audio.lautRuf` | mp3-Liste | „{laut} … {tier}!“ |
| `audio.ichFange` | mp3-Liste | „Ich fange mit {laut} an!“ |
| `audio.raetsel` | mp3-Liste | je Rätselsatz eine Datei |
| `audio.ichBin` | mp3-Liste | „Ich bin {artikel} {tier}!“ |
| `audio.silben` | mp3-Liste | je Silbe eine Datei, gleiche Länge wie `silben` |
| `audio.geschrieben` | mp3-Liste | „Du hast {artikel} {tier} geschrieben!“ |
| `audio.nichtIch` | mp3-Liste | Umlenksatz für F6 |
| `audio.gaehnen` | mp3-Liste | Gute-Nacht-Satz/Gähnen |
| `audio.freude` | mp3-Liste | wie bisher, aber jetzt 3–4 Varianten empfohlen |

- **Testpaket** (`tools/testpaket_bauen.mjs` → `tests/fixtures/testpaket.zip`): die drei
  selbst gezeichneten Tiere bekommen `anlaut`, `silben`, `bewegung`, `raetsel` und eine
  Situation, dazu ein viertes erfundenes Tier mit Phonogramm-Anlaut (prüft das Herausfiltern).
  Audio darf im Testpaket fehlen, dann greift die Rückfallstimme.
- **Paket-Bauer im privaten Paket-Repo** (nicht hier): erzeugt die Felder aus den eigenen
  Kartentexten, pflegt `anlaut`/`silben`/`helfer` von Hand und vertont alle Sätze in **einem**
  Lauf mit **einer** festen Stimme, auf gemeinsame Lautheit normalisiert (≈ −16 LUFS).
- `docs/tier-paket.md` um die Tabelle oben und die Lautregel ergänzen.

**Lernziel:** Anlaute sind lautrichtig. Ein falscher Laut („s wie …“ bei einem sch-Tier) lehrt
das Falsche.
**Spaß-Element:** keines, aber ohne F0 gibt es keine Anlaut-Tiere.
**data-testid:** keine neuen. Abnahme: Import des Testpakets, danach haben die Anlaut-Spiele
genau die Tiere mit gültigem Einzel-Anlaut (Phonogramm-Tier fehlt).
**Tonbedarf:** keiner in der App. Die Liste je Tier steht in Abschnitt 6b.
**Aufwand:** mittel (Validator, Vertrag `src/kern/vertrag.ts`, Doku, Testpaket).

---

### F1 – Erster Laut: Stufen im Tier-Modus, Tier-Wiese, Weiter-Knopf

**Verhalten im Detail**

1. **Tier-Wiese statt fester Reihe:** Der Tier-Modus öffnet mit **3 großen Medaillons**. Zwei
   kommen aus der leichten Vorauswahl der aktuellen Stufe (lautreine, kurze Namen), eins hatte
   das Kind lange nicht. Ein Tipp aufs Medaillon: Das Tier hüpft in seiner Bewegung (F4) und sagt
   seinen Namen. Ein zweiter Tipp oder der große Stift-Knopf daneben startet das Schreiben. Ein
   ruhiger Knopf „andere Tiere“ (Bild: drei kleine Medaillons, ohne Würfel und ohne Animation)
   zeigt drei neue. Dazu gibt es „noch mal“ (Bild: Pfeil im Kreis um das letzte Tier). Kein Tier ist gesperrt.
2. **Stufen** (Einstellung `tierStufe`, Standard **1**):
   - **Stufe 1, nur Anlaut:** Das Wort steht als Schattenvorlage da, Feld 0 leuchtet sanft,
     **alle anderen Felder sind schon gefüllt**. Zur Wahl liegen **2 große Tasten**: der Anlaut und ein
     **kontrastierender** Ablenker. Nie m/n, b/p/d, f/w, nie zwei Zischlaute, und möglichst ein
     Buchstabe, den das Kind schon kennt. Die Stimme lädt ein: „Womit fängt {artikel} {tier} an?
     {laut_lang}“. Ist der Anlaut gelegt, leuchten die übrigen Buchstaben **der Reihe nach** in
     ihrer Farbe auf, und jeder klingt mit seinem Laut (Lautsynthese, aus vorhandenen
     Lautclips verkettet, ≈ 350 ms Abstand). Danach liest die Stimme das Wort normal und das
     Tier freut sich.
   - **Stufe 2:** Anlaut und letzter Buchstabe fehlen, 3 Tasten. Den letzten Buchstaben gibt es nur bei
     Tieren, deren Schreibwort auf einen Einzellaut endet.
   - **Stufe 3:** ganzes Wort, Vorlage, Buchstaben des Worts plus 2 Ablenker (`vollesAlphabet:false`).
   - **Stufe 4:** heutiges Verhalten (volles Alphabet).
3. **Tierauswahl je Stufe:** Stufe 1–2 nur Tiere mit gültigem Einzel-`anlaut` und
   lautgetreuem Schreibwort (`istLautgetreu` plus kein `ei`, `eu`, `au`, `ie`, `sp`, `st`, `v`
   am Anfang). Phonogramm-Namen erst ab Stufe 4.
4. **Hilfe:** Nach dem **2.** Fehlversuch (statt heute 3.) pulsiert die gesuchte Taste, und das Tier
   (nicht eine neutrale Stimme) sagt „{laut}!“. Der falsche Buchstabe klingt wie bisher mit
   seinem Laut und wackelt. Es gibt keinen Fehlerton.
5. **Kein Auto-Weiter:** Nach der Freude bleibt das Tier sitzen, und an Stelle der Tasten (dort, wo der
   Finger schon ist, ohne dass etwas verrutscht) pulsiert langsam ein
   großer **Weiter-Knopf** mit der Silhouette eines Tiers. Bis dahin löst jeder Tipp aufs Tier
   etwas Neues aus: 1. Name, 2. „kann“-Satz, 3. Bewegung (F4) und Freude-Variante. Jede Ausgabe
   bricht beim nächsten Tipp ab.
6. **Gutes Ende:** nach `rundenBisGuteNacht` (Standard 6) gelungenen Tieren statt der Wiese das
   Gute-Nacht-Bild (siehe Abschnitt 4).

**Lernziel:** Anlaut → Buchstabe als erste echte Schreibhandlung. Die Schwierigkeit ist auf
einen einzigen neuen Schritt beschränkt. Das automatische Nachklingen zeigt, wie Laute ein Wort
ergeben.
**Spaß-Element:** Ein Tipp, und das ganze Tier schreibt sich und freut sich. „ICH hab den Igel
geschrieben.“ Es wählt sein Lieblingstier selbst und darf es wiederholen.
**data-testid:**
`tier-wiese`, `tier-wahl-<tierId>`, `tier-wahl-andere`, `tier-wahl-nochmal`, `tier-schreiben`,
`tier-weiter`, `tier-stufe` (mit `data-stufe`), bestehende `slot-<i>` (mit `data-gefuellt`,
neu `data-offen="ja|nein"`), `taste-<b>` (neu `data-hinweis="ja"` beim Pulsieren),
`einstellung-tier-stufe`, `gute-nacht`.
**Tonbedarf (öffentlich, generisch):**
- Einladung, je Laut (`einladung.<laut>`): „Hör mal: {laut_lang} …“ / „{laut_lang} … welcher
  Buchstabe ist das?“ / „Wie klingt der Anfang? {laut_lang}“ (3 Varianten × ≈ 22 Laute).
- Hilfe-Laut nutzt den vorhandenen Lautclip.
- Lob nach dem Nachklingen (`lob.allgemein`, siehe 6a).

**Tonbedarf (Paket, je Tier):** `audio.anlautName` (2 Varianten: „{tier_gedehnt}“,
„{laut_lang} … {tier}“), `audio.geschrieben` (3 Varianten, siehe 6b), `audio.freude`
(3–4 Varianten).
**Aufwand:** klein bis mittel. `src/modi/tiere/index.ts` (Wiese, Stufe, kein Auto-Weiter),
`src/modi/nachfuellen/wortarbeit.ts` (neue Option `offeneFelder: number[]`, vorbelegte Felder,
`ablenker: 1|2`, Hilfsschwelle als Option, Nachklingen), `src/kern/einstellungen.ts` +
`vertrag.ts` (`tierStufe`, `rundenBisGuteNacht`).

---

### F2 – Laut ruft Tier (Anlaut-Tier bei jedem Buchstaben)

**Verhalten im Detail**

- Gilt im Freien Schreiben und überall, wo das bewegliche Alphabet liegt, **außer** mitten in
  einer Wortarbeit (dort würde es den Hinweis verraten). Abschaltbar (`lautRuftTier`, Standard an).
- Tippt das Kind einen Buchstaben, klingt **sofort** (unter 100 ms) der Laut wie bisher. Erst **danach**
  (nach dem Ende des Lauts) wackelt am Blattrand die Decke, und **ein** Tier aus dem Paket, dessen
  `anlaut` genau dieser Buchstabe ist, lugt als kleines Medaillon hervor und sagt
  „{laut} … {tier}!“ (`audio.lautRuf`). Es gibt keinen Text und keinen Platzhalter, wenn kein Tier passt.
  Dann kommt einfach nichts.
- Tippt das Kind dieselbe Taste noch einmal, kommt das **nächste** Tier mit diesem Laut, der Reihe
  nach (fest, kein Zufall). Sind alle durch, beginnt die Reihe von vorn.
- Tippt das Kind das Medaillon an, kommt das Tier groß heraus (vorhandene Einblendung
  `frei__besuch`) und sagt seinen „kann“-Satz. Ohne Antippen verschwindet es nach ≈ 3 s still.
- Tippt das Kind weiter, bricht der Ruf sofort ab, und der neue Laut hat Vorrang. Es läuft
  immer nur eine Tonquelle.
- Ergibt das Geschriebene einen Tiernamen, kommt das Tier wie heute ganz heraus und freut sich.
- **Regal-Variante für Stufe B:** Die Kachel „Laut ruft Tier“ öffnet das Freie Schreiben mit
  **kleinem Kasten**: nur 4–6 große Tasten (Anfangsbuchstabe des Kindes, falls gesetzt, plus Laute
  mit Tieren im Paket, kontrastierend gewählt). Die Tastenauswahl stellt Papa ein.
- **Kauderwelsch vorlesen:** Nach einer Tipp-Pause von 2 s liest die App das letzte Wort
  lautierend und dann zusammengezogen vor, auch Unsinn wie „mamuso“ (live, weil frei
  geschrieben).

**Lernziel:** Jeder Buchstabe bekommt ein Ankertier mit dem richtigen Laut. Das ist eine lebendige
Anlauttabelle aus den Lieblingstieren. Aus zufälligem Tippen wird Entdecken („Wo ist der
Igel-Buchstabe?“).
**Spaß-Element:** Jede Taste ist eine Überraschungstür. Die Überraschung ist ehrlich, denn der Laut
bestimmt das Tier. Papa kann fragen: „Welcher Buchstabe holt den Igel?“
**data-testid:** `anlaut-gucker` (mit `data-tier`, `data-laut`, `data-offen`),
`anlaut-gucker-tier`, `kleiner-kasten`, `einstellung-laut-ruft-tier`,
`einstellung-kasten-buchstaben`.
**Tonbedarf (öffentlich):** Geräusch `geraeusch.decke-wackelt` (2 Varianten, < 400 ms, leise),
`geraeusch.plopp` (2 Varianten, < 150 ms).
**Tonbedarf (Paket, je Tier mit Einzel-Anlaut):** `audio.lautRuf`, 3 Varianten:
„{laut} … {tier}!“, „{laut} – wie {tier}!“, „{laut_lang} … da bin ich, {artikel} {tier}!“.
Der Laut im Satz muss genauso klingen wie der Tastenlaut.
**Aufwand:** klein bis mittel. `src/modi/frei/index.ts` (Gucker, kleiner Kasten), neue Hilfe
`src/paket/anlaut.ts` (`tiereMitAnlaut(pakete): Map<Buchstabe, TierTreffer[]>`), Einstellungen.

---

### F3 – Wer ist unter der Decke? (Lausch-Versteck mit Hilfeleiter)

Zusammengelegt aus Lausch-Spiel, Rate-Decke, Laut-Detektiv und Anlaut-Versteck.

**Verhalten im Detail**

- Eigene Regal-Kachel (Bild: Decke mit Beule und einem Ohr). In der Mitte liegt eine
  Patchwork-Decke, unter der sich etwas wölbt und leise wackelt. Im Hintergrund läuft keine Musik.
- **Hilfeleiter:** Jeder Tipp auf die Decke gibt einen deutlicheren Hinweis:
  1. ein Rätselsatz ohne Namen (`audio.raetsel`), z. B. „Ich habe Stacheln.“,
  2. „Ich fange mit {laut_lang} an!“ (`audio.ichFange`),
  3. die erste Silbe (`audio.silben[0]`),
  4. die Decke fliegt weg, das Tier kommt hervor und sagt „Ich bin {artikel} {tier}!“, dann Freude.
  Die Auflösung kommt **immer**. Raten ist ein Angebot, keine Pflicht.
- **Stufe 0 (Standard):** Unter der Decke stehen zusätzlich **2 Tier-Medaillons** (das gesuchte
  und eins mit stark kontrastierendem Anlaut). Tippt das Kind das richtige an, fliegt die Decke
  sofort weg, mit der **großen** Freude. Tippt es das andere an, sagt dieses nur freundlich
  seinen gedehnten Namen („{tier_gedehnt}“) und schaut zur Decke. Es kichert nicht und es gibt keine Show,
  damit Danebentippen nicht lustiger ist als der Treffer. Danach wiederholt die Decke den letzten Hinweis.
- **Stufe 1 (Papa schaltet um):** statt der Medaillons **2 große Buchstaben**. Der richtige zieht
  die Decke weg, der andere klingt nur mit seinem Laut.
- **Erst nach** der Auflösung erscheint klein unter dem Tier sein Anlaut-Buchstabe (blau/rot),
  antippbar mit Laut. Das bereitet die Zuordnung vor, ohne sie zu verlangen.
- Nur Tiere mit gültigem Einzel-`anlaut`. Paarungen: nie m/n, b/p/d, f/w, nie zwei Zischlaute.
- Nach 3 Tieren schlägt die Decke vor, schlafen zu gehen (Gute-Nacht, siehe Abschnitt 4).
  Mit einem Tipp geht es weiter.

**Lernziel:** Anlaut heraushören (Kern der phonologischen Bewusstheit) als Angebot mit
Hilfestufen. Dazu Wortabruf, Satzmuster „Ich bin der/die …“ mit Artikel und Hörverstehen.
**Spaß-Element:** Guck-guck mit dem Lieblingstier. Die Spannung kommt von der wackelnden Decke, der
Erfolg ist garantiert, und mit Papa wird es ein Ratespiel („Hörst du? iii …“).
**data-testid:** `decke` (mit `data-hinweis="0..4"`), `decke-tier`, `decke-wahl-<tierId>`,
`decke-wahl-taste-<b>`, `decke-anlaut`, `decke-stufe`, `modus-decke`.
**Tonbedarf (öffentlich):** `frage.wer-unter-decke` (3 Varianten: „Wer ist da unter der
Decke?“, „Da wackelt was! Wer ist das?“, „Psst … wer versteckt sich da?“),
`frage.wer-faengt-an.<laut>` (3 Varianten je Laut: „Wer fängt mit {laut_lang} an?“, „Hör
mal: {laut_lang}. Wer ist das?“, „{laut_lang} … wer fängt so an?“), Geräusche
`geraeusch.decke-wackelt`, `geraeusch.decke-weg` (Wusch, 2 Varianten).
**Tonbedarf (Paket, je Tier):** `audio.raetsel` (1–3 Sätze), `audio.ichFange` (2 Varianten:
„Ich fange mit {laut_lang} an!“, „Mein Name fängt mit {laut_lang} an!“), `audio.ichBin`
(3 Varianten: „Ich bin {artikel} {tier}!“, „Hallo! Ich bin {artikel} {tier}!“, „Kuckuck – ich
bin {artikel} {tier}!“), `audio.anlautName`.
**Aufwand:** mittel. Neuer Modus `src/modi/decke/`, `ModusId` erweitern.

---

### F4 – Tiere mit Persönlichkeit (Bewegung je Tier)

**Verhalten im Detail**

- `erzeugeFreude` und `erzeugeMedaillon` (`src/modi/tiere/freude.ts`) bekommen die Option
  `bewegung`. Je Bewegungsart gibt es eine eigene Keyframe-Folge: `huepft` (heutige Sprünge),
  `fliegt` (Schleifen über die Bühne), `kriecht` (langsam quer, mit Glitzerspur), `schwimmt`
  (Wellenlinie), `rollt` (Rolle), `klettert` (hoch und runter), `watschelt` (Schaukeln),
  `schlaengelt` (S-Kurve), `stampft` (schwere Sprünge, Bühne wackelt um 2 px), `tanzt` (Drehung).
- Das Medaillon bleibt rund, die Bewegung kommt aus Pfad und Squash-Kurve. Ohne Feld wird das
  heutige Hüpfen gezeigt.
- `prefers-reduced-motion`: nur der Glanz wie heute.
- Wirkt in allen Modi: Freude, Wiese (F1), Gucker (F2), Decke (F3), Geschichten (F6).
- Jede Bewegungsart hat ein kurzes generisches Geräusch. Es klingt **nicht** über
  Sprache: Erst kommt das Geräusch, dann der Satz.

**Lernziel:** Wort und Bedeutung verbinden sich (was kann das Tier?). Unterscheidbare Tiere
bleiben besser im Gedächtnis, und Verben werden nebenbei gelernt.
**Spaß-Element:** Jedes Tier ist jemand. Das Kind wartet darauf, was es diesmal macht, und ahmt
es nach.
**data-testid:** `tier-freude` bekommt `data-bewegung`, Medaillons `data-bewegung`.
**Tonbedarf (öffentlich):** je Bewegungsart 2 Varianten: `geraeusch.bewegung.<art>`
(Flattern, Plopp-Sprung, Schlurfen, Platschen, Kullern, Kratzen, Watscheln, Zischeln,
Stampfen, Drehklang), je < 700 ms, leise.
**Tonbedarf (Paket):** keiner.
**Aufwand:** klein. `src/modi/tiere/freude.{ts,css}`.

---

### F5 – Silben-Hüpfen

**Verhalten im Detail**

- Regal-Kachel (Bild: Tier auf drei Trommelflecken). Oben steht das Tier, darunter liegen so viele
  runde Flecken, wie `silben` lang ist.
- Tippt das Kind aufs Tier, sagt es den Namen ganz, dann rhythmisch in Silben. Bei jeder Silbe
  hüpft es auf den nächsten Flecken, und darunter wächst ein Silbenbogen.
- Danach tippt das Kind **beliebige** Flecken: Jeder Tipp spielt die **nächste** Silbe und lässt
  das Tier einen Hüpfer machen. Eine falsche Reihenfolge gibt es nicht. Nach der letzten Silbe
  sagt die Stimme das ganze Wort, und das Tier freut sich.
- Reihenfolge der Tiere: zuerst wenige Silben, dann längere Namen (lange Ketten sind lustig).
  Auswahl über die Tier-Wiese (3 Medaillons).
- Nur Tiere mit `silben` **und** `audio.silben`. Silben werden nie automatisch getrennt.
  Gemeint sind Sprechsilben, so wie man klatscht.
- Elternzeile (klein, grau, ausblendbar): „Klatscht mit!“

**Lernziel:** Silbensegmentierung, die altersgerechteste Stufe der phonologischen
Bewusstheit, dazu Rhythmus und Prosodie. Sie bereitet den Silbenbogen beim späteren Schreiben vor.
**Spaß-Element:** Ursache und Wirkung mit Körper: Ich tippe, das Tier hüpft, Papa klatscht mit.
**data-testid:** `modus-silben`, `silben-tier`, `silbe-<i>` (mit `data-gespielt="ja|nein"`),
`silben-bogen`, `silben-fertig`.
**Tonbedarf (öffentlich):** `geraeusch.trommel` (3 Varianten, weich, < 200 ms),
`aufforderung.klatschen` (3 Varianten: „Klatsch mit!“, „Wir klatschen den Namen!“, „Hüpf
mit!“).
**Tonbedarf (Paket, je Tier):** `audio.silben` (je Silbe eine Datei, deutlich, aber natürlich,
**in einem Zug aufgenommen und geschnitten**, nicht Silbe für Silbe einzeln erzeugt),
`audio.name`.
**Aufwand:** mittel. Neuer Modus `src/modi/silben/`.

---

### F6 – Wer hilft? (Geschichten aus dem Paket)

**Verhalten im Detail**

- Regal-Kachel (Bild: zwei Tiere Hand in Hand). Erscheint nur, wenn das Paket `situationen` hat.
- Ablauf einer Geschichte (60–90 s):
  1. Das Problemtier steht groß da, leicht entsättigt, mit leisem Wackeln. Die Stimme erzählt
     `audio.problem`. Danach kommt „Wer kann helfen?“.
  2. **2 Helfer-Medaillons**: der Helfer aus `helfer` und ein anderes Tier. Die Stimme verrät
     den Helfer **nicht**.
  3. Tippt das Kind den richtigen an, fliegt er heran. Danach (ab F1 Stufe 1, abschaltbar) liegt sein
     Name als Schattenwort da, **nur der Anlaut fehlt**, mit 2 Tasten. Nach dem gelegten Anlaut
     klingt das Wort gedehnt nach (wie F1). Dann erzählt die Stimme `audio.loesung`, und **beide**
     Tiere freuen sich.
  4. Tippt das Kind den anderen an, sagt dieser seinen „kann“-Satz und lenkt freundlich um
     (`audio.nichtIch`). Er wirkt dabei nicht traurig. Danach wird die Frage wiederholt.
  5. Hat der Helfer keinen gültigen Einzel-Anlaut, entfällt Schritt 3 (Schreiben). Er wird
     dann nur herbeigerufen, und es gibt kein Phonogramm in Stufe 1.
- Jede Geschichte geht gut aus. Nach 3 Geschichten folgt das sanfte Ende („Jetzt kuscheln sich
  alle auf die Decke.“).
- Jeder Satz ist durch Antippen abbrechbar. Zwischen den Sätzen bleiben 1–1,5 s Stille zum
  Nachsprechen.
- Elternzeile: eine offene Frage, die die App zufällig aus 3 generischen wählt („Wer könnte
  noch helfen?“).

**Lernziel:** Schrift bewirkt etwas, denn wer den Buchstaben legt, ruft den Helfer. Dazu kommen
Erzählen (Problem → Hilfe → Lösung), Satzmodelle mit Artikel und Verben sowie das Helfen als
Thema.
**Spaß-Element:** Das Kind kennt die Geschichten und wird zum Helden, der den richtigen Freund
holt. Das kleine „Ich weiß es!“ ist der stärkste Motor in diesem Alter.
**data-testid:** `modus-geschichten`, `geschichte` (mit `data-situation`, `data-schritt`),
`geschichte-problemtier`, `helfer-wahl-<tierId>`, `geschichte-schreiben`,
`geschichte-loesung`, `geschichte-ende`.
**Tonbedarf (öffentlich):** `frage.wer-hilft` (3 Varianten: „Wer kann helfen?“, „Oh je – wer
hilft da?“, „Wer weiß, wer helfen kann?“), `geschichte.gemeinsam` (3 Varianten: „Zusammen
geht's!“, „Geschafft – zusammen!“, „Jetzt freuen sich beide!“), `geschichte.ende`
(3 Varianten), `elternfrage` (nur Text, kein Ton), Geräusche `geraeusch.oh-oh` (sanft,
2 Varianten), `geraeusch.loesung` (≈ 1 s, 2 Varianten).
**Tonbedarf (Paket, je Situation):** `audio.problem` (1–2 Varianten), `audio.loesung`
(1–2 Varianten). Je Tier: `audio.nichtIch` (3 Varianten: „Ich kann {kann_kurz} – aber hier
hilft jemand anders!“, „Hmm, das kann ich nicht. Frag noch mal!“, „Ich bin's nicht – aber ich
helfe beim Suchen!“). Für jeden Satz zuerst **5–10 kuratierte Situationen** vertonen, nicht
alle auf einmal.
**Aufwand:** mittel bis groß. Neuer Modus `src/modi/geschichten/`, nutzt Wortarbeit mit
`offeneFelder`.

---

### F7 – Meine Leute (Familienwörter mit Elternstimme)

**Verhalten im Detail**

- Papa legt im Elternbereich bis zu 8 Personen an: Foto (Kamera oder Datei, auf ≈ 512 px
  verkleinert), Wort (lautgetreu, nur Buchstaben des Alphabets, z. B. „mama“, „papa“, „oma“,
  „opa“) und eine eigene Aufnahme des Worts (Aufnahme-Bausteine aus dem Laut-Studio). Alles
  liegt **nur in IndexedDB**, kommt in keinen Export und in kein Paket.
- Für das Kind gibt es eine Regal-Kachel (Bild: zwei Gesichter-Umrisse) und eine Wiese mit den Fotos.
  Ein Tipp aufs Foto spielt Papas Aufnahme („Papa!“). Ein zweiter Tipp startet die Wortarbeit
  auf der eingestellten Stufe (Stufe 1: nur Anlaut, 2 Tasten). Nach dem Nachklingen kommt die
  Elternaufnahme, danach das allgemeine Lob.
- Der **Anfangsbuchstabe des Kindes** (Einstellung `kindAnfang`, ein einzelner Buchstabe) kann
  als eigener Eintrag mit Foto und Aufnahme des Namens angelegt werden. Gespeichert wird das Wort nur lokal,
  und die Datenschutz-Abnahme muss das abdecken. Die bestehende Einstellung `kindName` wird dafür
  **nicht** gebraucht.

**Lernziel:** Bedeutsame erste Schreibwörter. Mama, papa, oma, opa sind phonologisch ideal
(Konsonant-Vokal-Wiederholung). Der eigene Anlaut ist meist der erste sicher erkannte Buchstabe.
**Spaß-Element:** Papas Gesicht und Papas Stimme in der App. Für ein knapp Dreijähriges gibt es
nichts Stärkeres.
**data-testid:** `modus-leute`, `leute-wiese`, `leute-<id>`, `leute-anlegen`,
`leute-foto`, `leute-wort`, `leute-aufnahme`, `leute-loeschen-<id>`.
**Tonbedarf (öffentlich):** `lob.leute` (3 Varianten: „Das hast du geschrieben!“, „Schau mal,
wer da ist!“, „Da freut sich jemand!“). Das Wort selbst ist die Elternaufnahme, als Rückfall gilt der
vorab vertonte Wortbestand.
**Tonbedarf (Paket):** keiner.
**Aufwand:** mittel. Neuer Modus `src/modi/leute/`, Store in `src/kern/`, Abnahme mit
erfundenem Wort und Testbild.

---

## 4. Verbesserungen am Bestand

| # | Was | Dateien |
|---|---|---|
| B1 | **Regal-Startseite:** Für das Kind höchstens 3–4 große Bildkacheln. Papa wählt sie im Elternbereich (`regal: ModusId[]`). Ein erster Tipp sagt den Namen der Kachel (`kachel.<id>`), ein zweiter Tipp öffnet sie (oder Halten). Nachfüllen und Freies Schreiben mit vollem Alphabet stehen anfangs nicht im Regal. | `src/kern/start.ts`, `src/kern/einstellungen.ts`, `src/kern/vertrag.ts`, `src/modi/einstellungen/index.ts` |
| B2 | **Tier-Modus nicht mehr hart auf `vollesAlphabet: true`**, Standard ist Stufe 1 (F1). Kein Auto-Weiter nach `FREUDE_DAUER_MS`, sondern ein Weiter-Knopf. | `src/modi/tiere/index.ts` |
| B3 | **Hilfsschwelle** in der Wortarbeit als Option (`hilfeNach`, Standard 2 bei Stufe 1–3, 3 sonst). Die gesuchte Taste bekommt `data-hinweis`. | `src/modi/nachfuellen/wortarbeit.ts`, `src/ui/alphabet.ts` |
| B4 | **Schwierigkeit nach Lauttreue:** `tiereNachSchwierigkeit` schiebt Namen mit Phonogrammen oder Konsonantenhäufung am Anfang (`sch`, `sp`, `st`, `ei`, `eu`, `au`, `ie`, `pf`, `v`, `qu`) ans Ende. `SCHWER` um `ei|eu|au|ie|sp|st|pf|qu` am Anfang erweitern. Die Tier-Reihe (`reiheNachSchwierigkeit`) nutzt dieselbe Funktion statt der Kopie. | `src/paket/woerter.ts`, `src/modi/tiere/index.ts` |
| B5 | **„Alles wegräumen“ mit Stimme:** Wegräumen geht nur noch per Halten (≈ 0,6 s, Ring füllt sich). Danach kommt ein leises Wisch-Geräusch und ein freundlicher Satz (`wegraeumen.*`), das Zurückholen sagt `zurueckholen.*`. So gibt es keinen stillen Verlust und keinen Schreck. | `src/modi/frei/index.ts` |
| B6 | **Patschhand-Schutz:** nur den ersten Pointer werten. Ausgelöst wird bei `pointerup` auf derselben Taste, Tipps auf eine andere Taste innerhalb von 150 ms werden verworfen, dazu `touch-action: manipulation`. | `src/ui/alphabet.ts`, `src/ui/alphabet.css` |
| B7 | **Nicht versehentlich verlassen:** In den Kind-Modi fängt ein History-Eintrag den Android-Zurück ab. Der Zurück-Knopf ist klein und braucht 1 s Halten. Solange ein Modus offen ist, verhindert ein Wake Lock, dass der Bildschirm ausgeht. | `src/kern/router.ts`, `src/kern/elternsperre.ts` (Halten wiederverwenden) |
| B8 | **Spracheingabe nur hinter der Elternsperre**, nie als Richter über die Aussprache des Kindes. | `src/modi/frei/index.ts`, `src/modi/einstellungen/index.ts` |
| B9 | **Gute-Nacht-Ende** statt Endlosschleife: nach `rundenBisGuteNacht` Runden (Tier-Modus, Decke, Geschichten) gähnen die Tiere der Sitzung, kuscheln sich auf eine Decke, und das Licht wird warm und gedimmt. Ein Tipp weckt sie wieder. Es wird nichts gesammelt, auf der Decke liegen nur die Tiere **dieser** Sitzung. | neu `src/modi/tiere/gute-nacht.ts` |
| B10 | **Freude variieren:** `sprichFreude` wählt eine Freude-Variante, die nicht dieselbe ist wie beim letzten Mal. Trifft das Kind dasselbe Tier wieder, beginnt die Freude mit dem „kann“-Satz statt dem Namen. Die ganze Kette dauert höchstens ≈ 8 s und lässt sich jederzeit abbrechen. | `src/modi/tiere/freude.ts` |
| B11 | **Sprechpausen:** zwischen festen Sätzen einer Kette 1–1,5 s Stille, zum Nachsprechen. | `src/modi/tiere/freude.ts`, neue Hilfe in `src/audio/index.ts` |
| B12 | **Feste Sätze mit Varianten:** `AudioDienst.fest(schluessel)` spielt aus `manifest.saetze[schluessel]` (neu: Liste) eine Variante, nie dieselbe zweimal hintereinander. Feste Sätze werden **nie** live vertont. Fehlt eine Datei, ist das ein gemeldeter Fehler. Live-Stimme (Browser/Piper/OpenRouter je Einstellung) gibt es nur für frei Geschriebenes. | `src/kern/vertrag.ts`, `src/audio/index.ts`, `public/audio/manifest.json`, `tools/vertonen.py` |
| B13 | **Gedehnte Laute** als eigene Variante je Buchstabe (`laute_lang`): Dauerlaute 1,5–2 s, Plosive 2–3× kurz ohne Schwa. Werden in F1/F3 benutzt. Das Laut-Studio zeigt sie zum Gegenhören. | `tools/vertonen.py`, `src/audio/index.ts`, `src/modi/laut-studio/index.ts` |
| B14 | **Lautheit normalisieren** auf ≈ −16 LUFS für den ganzen Bestand und alle Paket-Audios (im Paket-Bauer). Beim ersten Start sehen Eltern einen bildlichen Hinweis auf den Stummschalter (iPhone). | `tools/vertonen.py`, `src/kern/start.ts` |
| B15 | **Vorladen:** Bild und Audio der nächsten 3 Tiere (Wiese) werden dekodiert, solange das aktuelle Tier sich freut. Paketbilder werden beim Import auf ≈ 512 px webp verkleinert. | `src/paket/index.ts`, `src/modi/tiere/index.ts` |
| B16 | **Elternbereich:** je Modus eine kurze Begleitkarte (2–3 Sätze: Laut vormachen, nicht korrigieren, Lauschspiele im Alltag). Dazu ein Feld „Anfangsbuchstabe des Kindes“ (`kindAnfang`, ein Buchstabe) und die Zeile „heute dran“ (Laute/Tiere der letzten Sitzung, nur für Eltern, hinter der Sperre). | `src/modi/einstellungen/index.ts`, `src/kern/vertrag.ts` |
| B17 | **Querformat:** Im Tier- und Nachfüll-Modus steht das Bild links, Wort und Tasten rechts. Die Abnahme läuft zusätzlich bei 844×390. | `src/modi/tiere/tiere.css`, `src/modi/nachfuellen/wortarbeit.css`, `tests/abnahme/abnahme.spec.ts` |
| B18 | **Tonquellen-Einstellung** an den Rahmen angleichen: live wahlweise Browser, Piper (offline) oder OpenRouter. Spracheingabe wahlweise Browser oder OpenRouter. Azure wird zur Altlast. | `src/audio/`, `src/kern/einstellungen.ts` |

---

## 5. Bewusst NICHT

- **Keine Sammelmechanik:** keine Sterne, Punkte, Münzen, Zähler („12 von 51“), Fortschrittsbalken,
  Streaks, freigeschaltete Tiere, leeren oder grauen Plätze. Auch keine Decke, die durch Spielen
  voller wird. Alle Tiere sind immer da.
- **Kein Fehlerton, kein Rot, kein Kopfschütteln, kein „Nein“.** Traurig darf ein Tier nur in
  der Geschichte sein, nie wegen eines falschen Buchstabens. **Danebentippen darf nicht lustiger
  sein als der Treffer**, die größte Freude gehört dem Treffer.
- **Spracherkennung nie als Richter** über die Aussprache des Kindes. Ersetzungen wie sch→s oder k→t
  sind mit knapp 3 normal. Spracheingabe nur für Papa, hinter der Sperre.
- **Anlaut nie aus dem ersten Buchstaben ableiten.** Keine Phonogramm-Tiere (sch, schp, scht,
  ei, eu, v als f, stimmhaftes s) unter einem Einzelbuchstaben. Ohne `anlaut` spielt ein Tier in Anlautspielen nicht mit.
- **Keine Buchstabennamen** („em“, „be“), **kein Schwa an Plosiven**, keine Großbuchstaben als
  Standard, auch nicht in Rätseln, Rufen und Freude-Sätzen.
- **Nicht mehrere ähnliche Buchstaben nebeneinander** (m/n, b/d/p, f/w) und nicht viele neue auf
  einmal.
- **Kein Zeitdruck:** keine Countdowns, kein Auto-Weiter, keine „sanfte Einladung“ nach 20 s
  Ruhe. Pausen gehören dem Kind.
- **Keine Lootbox-Überraschung:** Der Laut bestimmt das Tier, die Reihenfolge ist fest. Keine
  seltenen Tiere, keine Zufalls-Spezialanimation.
- **Keine Push-Benachrichtigungen, keine Lockrufe** („Dein Tier vermisst dich!“).
- **Keine langen Ketten:** Name + Freude + kann zusammen höchstens ≈ 8 s, jede Ausgabe
  abbrechbar. Keine Hintergrundmusik und nie zwei Tonquellen gleichzeitig.
- **Feste Sätze nie live vertonen** und nie in mehreren Läufen mit wechselnder Stimme.
- **Keine Leuchtspur als Dauerzustand:** Dem Licht nachzutippen lehrt keine Laute. Hilfe nur
  nach Fehlversuchen.
- **Nicht zu viel im Regal:** höchstens 3–4 Kacheln für das Kind, ein Ding pro Bildschirm,
  höchstens 2–3 Tasten oder Medaillons in den neuen Spielen.
- **Keine Spur-Buchstaben (Sandpapier) in diesem Bau.** Sie kommen in der zweiten Welle mit
  fertigen Strichpfaden und breiter Toleranz.
- **Nichts Privates ins Repo:** keine Serienbilder, Tiernamen-Listen, Geschichtentexte,
  Familienfotos, Elternaufnahmen oder den Namen des Kindes, auch nicht in Tests, Fixtures,
  Screenshots oder Commit-Messages. Das Testpaket bekommt erfundene Tiere.
- **Der Bildschirm ist nicht das einzige Material.** Sitzungen sind kurz und mit Papa daneben. Die
  Begleitkarten verweisen auf Lauschspiele im Alltag.

---

## 6. Ton-Gesamtliste

Alle festen Sätze werden **vorab** mit einem starken Sprachmodell (gpt-audio) in **einem**
Lauf mit **einer** festen, warmen, langsamen Stimme erzeugt und auf ≈ −16 LUFS normalisiert.
Live gibt es nur frei Geschriebenes und Diktiertes. Varianten: 2–4 je Satz, abgespielt ohne
direkte Wiederholung. Geräusche sind eigen erzeugt oder frei lizenziert, nie aus der Serie.

### 6a. Öffentlich (generisch, `public/audio/`, Schlüssel in `manifest.json`)

**Laute**

| Schlüssel | Inhalt | Anzahl |
|---|---|---|
| `laute.<b>` | Laut je Buchstabe (vorhanden) | 30 |
| `laute_lang.<b>` | gedehnter Laut: Dauerlaute 1,5–2 s, Plosive „b-b-b“ ohne Schwa | 30 |

**Einladen und Fragen**

| Schlüssel | Varianten |
|---|---|
| `einladung.<laut>` | „Hör mal: {laut_lang} …“ · „{laut_lang} … welcher Buchstabe ist das?“ · „Wie klingt der Anfang? {laut_lang}“ |
| `frage.wer-faengt-an.<laut>` | „Wer fängt mit {laut_lang} an?“ · „Hör mal: {laut_lang}. Wer ist das?“ · „{laut_lang} … wer fängt so an?“ |
| `frage.wer-unter-decke` | „Wer ist da unter der Decke?“ · „Da wackelt was! Wer ist das?“ · „Psst … wer versteckt sich da?“ |
| `frage.wer-hilft` | „Wer kann helfen?“ · „Oh je – wer hilft da?“ · „Wer weiß, wer helfen kann?“ |
| `aufforderung.klatschen` | „Klatsch mit!“ · „Wir klatschen den Namen!“ · „Hüpf mit!“ |
| `aufforderung.weiter` | „Noch ein Tier?“ · „Wer kommt als Nächstes?“ · „Magst du noch eins?“ |

`<laut>` steht für die Laute, zu denen ein Tier mit Einzel-Anlaut passen kann (alle Buchstaben außer
c, q, x, y, ß, also ≈ 25 Laute).

**Lob (beschreibend, kein „Super!“)**

| Schlüssel | Varianten |
|---|---|
| `lob.allgemein` | „Das hast du geschrieben!“ · „Hör mal, was du geschrieben hast!“ · „Du hast den Anfang gefunden!“ · „Das klingt richtig!“ |
| `lob.anlaut` | „Ja, so fängt es an!“ · „Genau, das ist der Anfang!“ · „Den Anfang hast du gehört!“ |
| `lob.leute` | „Das hast du geschrieben!“ · „Schau mal, wer da ist!“ · „Da freut sich jemand!“ |

**Freude und Geschichte**

| Schlüssel | Varianten |
|---|---|
| `freude.allgemein` (Rückfall ohne Paket-Freude) | „Juhu!“ · „Hurra!“ · „Oh, wie schön!“ |
| `geschichte.gemeinsam` | „Zusammen geht's!“ · „Geschafft – zusammen!“ · „Jetzt freuen sich beide!“ |
| `geschichte.ende` | „Jetzt kuscheln sich alle auf die Decke.“ · „Alle sind froh – und jetzt wird gekuschelt.“ · „Das war eine schöne Geschichte.“ |

**Alles weg / Zurückholen (Ersatz für den stillen Knopf, B5)**

| Schlüssel | Varianten |
|---|---|
| `wegraeumen.satz` | „Alles weg – jetzt ist Platz für Neues!“ · „Schwupp, alles aufgeräumt!“ · „Das Blatt ist wieder leer.“ · „Weggewischt! Was schreibst du jetzt?“ |
| `zurueckholen.satz` | „Da ist es wieder!“ · „Hoppla – alles wieder da!“ · „Zurückgeholt!“ |
| `geraeusch.wisch` | leises Wisch-Geräusch (Tuch über Tafel), 3 Varianten, 300–500 ms |
| `geraeusch.zurueck` | kurzes, umgekehrtes Wischen bzw. sanftes Plopp, 2 Varianten |

**Zurückholen / Hilfe in Kind-Modi**

| Schlüssel | Varianten |
|---|---|
| `hilfe.nochmal` | „Hör noch mal genau hin.“ · „Wir probieren's noch mal.“ · „Hör mal …“ |
| `zurueck.halten` (beim zu kurzen Tipp auf Zurück, leise) | „Zum Zurückgehen lange drücken.“ (nur 1, sehr leise, für Eltern) |

**Gute Nacht**

| Schlüssel | Varianten |
|---|---|
| `gutenacht.satz` | „Die Tiere werden müde und kuscheln sich auf die Decke.“ · „Gähn … alle Tiere gehen schlafen.“ · „Psst – die Tiere schlafen jetzt.“ |
| `gutenacht.wecken` | „Oh, wer ist denn da wach?“ · „Guten Morgen, ihr Tiere!“ |
| `geraeusch.schlaflied` | leise Spieluhr, ≈ 6 s, eigen, 1 Fassung |

**Kacheln (B1, erster Tipp)**

| Schlüssel | Varianten |
|---|---|
| `kachel.tiere` | „Tiere schreiben!“ · „Zu den Tieren!“ |
| `kachel.laut-ruft-tier` | „Buchstaben rufen Tiere!“ · „Wer kommt bei welchem Buchstaben?“ |
| `kachel.decke` | „Wer ist unter der Decke?“ · „Versteckspiel!“ |
| `kachel.silben` | „Silben klatschen!“ · „Wir hüpfen den Namen!“ |
| `kachel.geschichten` | „Wer hilft?“ · „Eine Geschichte!“ |
| `kachel.leute` | „Meine Leute!“ · „Mama, Papa, Oma, Opa!“ |
| `kachel.frei` | „Frei schreiben!“ · „Schreib, was du willst!“ |
| `kachel.nachfuellen` | „Wörter nachlegen!“ · „Lücken füllen!“ |

**Geräusche**

| Schlüssel | Inhalt | Varianten |
|---|---|---|
| `geraeusch.decke-wackelt` | Stoffrascheln | 2 |
| `geraeusch.decke-weg` | Wusch | 2 |
| `geraeusch.plopp` | Tier lugt hervor | 2 |
| `geraeusch.trommel` | weicher Trommelfleck | 3 |
| `geraeusch.oh-oh` | sanft, nicht alarmierend | 2 |
| `geraeusch.loesung` | kurzer Lösungsklang ≈ 1 s | 2 |
| `geraeusch.bewegung.<art>` | je Bewegungsart (10 Arten) | 2 |
| `geraeusch.klack` | Stoff-Plopp beim Ablegen eines Buchstabens, < 80 ms | 3 |

### 6b. Paket (je Tier bzw. Situation, im privaten Paket-Repo erzeugt)

| Feld | Varianten (Text mit Platzhaltern) | Für |
|---|---|---|
| `audio.name` | „{tier}“ (vorhanden) | alle |
| `audio.anlautName` | „{tier_gedehnt}“ · „{laut_lang} … {tier}“ | F1, F3 |
| `audio.lautRuf` | „{laut} … {tier}!“ · „{laut} – wie {tier}!“ · „{laut_lang} … da bin ich, {artikel} {tier}!“ | F2 |
| `audio.ichFange` | „Ich fange mit {laut_lang} an!“ · „Mein Name fängt mit {laut_lang} an!“ | F3 |
| `audio.raetsel` | 1–3 Sätze ohne Namen, je 1 Fassung („Ich habe …“, „Ich kann …“) | F3 |
| `audio.ichBin` | „Ich bin {artikel} {tier}!“ · „Hallo! Ich bin {artikel} {tier}!“ · „Kuckuck – ich bin {artikel} {tier}!“ | F3 |
| `audio.silben` | je Sprechsilbe eine Datei, aus einer Aufnahme geschnitten | F5 |
| `audio.geschrieben` | „Du hast {artikel} {tier} geschrieben!“ · „{Artikel} {tier} – das hast du geschrieben!“ · „Schau, da steht {artikel} {tier}!“ | F1 |
| `audio.freude` | 3–4 Varianten, kurz, mit Artikel („Juhu, {artikel} {tier} freut sich!“ · „Hurra, du hast mich geschrieben!“ · „Ich freu mich so!“ · Tier-eigener Ausruf) | alle |
| `audio.kann` | 1 Fassung, auf Kindersprache gekürzt (höchstens ≈ 8 Wörter) | alle |
| `audio.nichtIch` | „Ich kann {kann_kurz} – aber hier hilft jemand anders!“ · „Hmm, das kann ich nicht. Frag noch mal!“ · „Ich bin's nicht – aber ich helfe beim Suchen!“ | F6 |
| `audio.gaehnen` | „Gute Nacht!“ · Gähnen · „Ich bin so müde …“ | B9 |
| `situationen[].audio.problem` | 1–2 Varianten je Situation | F6 |
| `situationen[].audio.loesung` | 1–2 Varianten je Situation | F6 |

Die Mengen für ein Paket mit *n* Tieren, davon *a* mit Einzel-Anlaut und *s* kuratierten
Situationen, sind: ≈ 2a (anlautName) + 3a (lautRuf) + 2a (ichFange) + 3n (ichBin) + ≈ 2n
(Rätsel) + Silben + 3n (geschrieben) + 4n (Freude) + n (kann) + 3n (nichtIch) + 3n (gähnen) +
2–4 s.

### 6c. Live (nie vorab, je Einstellung Browser / Piper offline / OpenRouter)

- frei geschriebene Wörter und Kauderwelsch im Freien Schreiben (`{wort}`),
- Wörter aus dem Wörterbuch, die nicht vertont sind,
- Familienwörter nur, wenn keine Elternaufnahme existiert.
