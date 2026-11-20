/**
 * VERTRAG der ABC-Werkstatt — alle gemeinsamen Typen und Schnittstellen.
 *
 * Eigentümer: Fundament (src/kern). Bau-Agenten implementieren diese Schnittstellen,
 * ändern sie aber nicht eigenmächtig. Braucht ein Bau eine Erweiterung, wird sie hier
 * additiv (optionales Feld / neue Methode mit Stub) ergänzt und in der Übergabe genannt.
 *
 * Grundsätze:
 * - Buchstaben werden IMMER kanonisch klein geführt (`Buchstabe`), die Anzeige
 *   (Großbuchstaben-Einstellung) ist reine Darstellung, siehe `anzeigeZeichen()` in kern/alphabet.ts.
 * - Fehler werden geworfen (eigene Fehlerklassen unten), nie still geschluckt.
 * - Bau-Spezifikation: docs/konzept-spass-und-lernen.md (F0–F7, B1–B18, Ton-Gesamtliste).
 */

import type { IconName } from './ui/icons';

// ---------------------------------------------------------------------------
// Buchstaben
// ---------------------------------------------------------------------------

/** Alle Laute des beweglichen Alphabets in Reihenfolge der Bildschirmtastatur. */
export const LAUTE = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
  'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  'ä', 'ö', 'ü', 'ß',
] as const;

/** Ein kanonischer Kleinbuchstabe aus `LAUTE`. */
export type Buchstabe = (typeof LAUTE)[number];

/** Vokale (Umlaute zählen als Vokale) — blau im beweglichen Alphabet. */
export const VOKALE: ReadonlySet<Buchstabe> = new Set<Buchstabe>(['a', 'e', 'i', 'o', 'u', 'ä', 'ö', 'ü']);

/** `vokal` (blau) oder `konsonant` (rot); landet als `data-art` an jeder Taste. */
export type BuchstabenArt = 'vokal' | 'konsonant';

/**
 * Laute, zu denen ein Tier mit Einzel-Anlaut passen kann (alle außer c, q, x, y, ß — Konzept 6a).
 * Für diese Laute gibt es die festen Sätze `einladung.<laut>` und `frage.wer-faengt-an.<laut>`.
 */
export const ANLAUT_LAUTE: readonly Buchstabe[] = LAUTE.filter((b) => !['c', 'q', 'x', 'y', 'ß'].includes(b));

// ---------------------------------------------------------------------------
// Router und Modi (IDs vorne, weil die Einstellungen sie brauchen)
// ---------------------------------------------------------------------------

/**
 * Bekannte Modus-IDs. Hash-Route ist `#/<id>` bzw. `#/<id>/<param>`; Start-Kachel `modus-<id>`,
 * erster Tipp spricht den festen Satz `kachel.<id>`.
 *
 * Kind-Arbeiten (Regal): `frei`, `nachfuellen`, `tiere`, `laut-ruft-tier` (F2, Freies Schreiben mit
 * kleinem Kasten), `decke` (F3), `silben` (F5), `geschichten` (F6 „Wer hilft?“), `leute` (F7 „Meine Leute“).
 * Elternbereich: `woerterbuch`, `einstellungen`, `laut-studio`.
 */
export type ModusId =
  | 'frei'
  | 'nachfuellen'
  | 'tiere'
  | 'laut-ruft-tier'
  | 'decke'
  | 'silben'
  | 'geschichten'
  | 'leute'
  | 'woerterbuch'
  | 'einstellungen'
  | 'laut-studio';

/** Alle Arbeiten, die im Regal stehen können (Reihenfolge = Reihenfolge der Auswahl im Elternbereich). */
export const REGAL_ARBEITEN: readonly ModusId[] = [
  'tiere', 'laut-ruft-tier', 'decke', 'silben', 'geschichten', 'leute', 'frei', 'nachfuellen',
];

/** Höchstens so viele Kacheln stehen für das Kind im Regal (Konzept B1: 3–4). */
export const REGAL_MAX = 4;

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** Stufe im Tier-Modus (F1): 1 nur Anlaut · 2 Anlaut + Endlaut · 3 ganzes Wort mit Auswahl · 4 volles Alphabet. */
export type TierStufe = 1 | 2 | 3 | 4;

/** Stufe des Deckenspiels (F3): 0 zwei Tier-Medaillons · 1 zwei große Buchstaben. */
export type DeckeStufe = 0 | 1;

/** Woher frei Geschriebenes klingt (B18). Feste Sätze kommen NIE von hier, sondern aus Dateien. */
export type LiveStimme = 'browser' | 'piper' | 'openrouter';

/** Spracheingabe für Eltern (B8, nur hinter der Elternsperre, nie als Richter). */
export type Spracheingabe = 'aus' | 'browser' | 'openrouter';

/** Alles, was Eltern einstellen können. Persistiert lokal im Gerät (localStorage). */
export interface Einstellungen {
  /** true = Buchstabennamen („em“) statt Laute („mmm“). Montessori-Standard: false. */
  namenStattLaute: boolean;
  /** true = Großbuchstaben anzeigen. Montessori-Standard: false (Kleinbuchstaben). */
  grossbuchstaben: boolean;
  /** Optional: Name des Kindes (nur lokal, nie im Repo). Für F7 NICHT gebraucht (dort `kindAnfang`). */
  kindName?: string;
  /** Tier-Modus Stufe 4: true = Wort als Vorlage mit Feldern, false = frei aus dem Kopf. */
  tierModusMitVorlage: boolean;
  /** Im Laut-Studio gewählte Variante je Buchstabe: Buchstabe → URL der Audiodatei (oder `aufnahme:<b>`). */
  gewaehlteLautVarianten: Partial<Record<Buchstabe, string>>;
  /**
   * Elternsperre: in der INSTALLIERTEN App (Startbildschirm) öffnen sich Wörterbuch und
   * Einstellungen erst nach langem Drücken. Im normalen Browser-Tab gilt sie nicht. Standard: true.
   */
  elternsperre: boolean;

  // ---- Regal und Lernpfad (B1, Abschnitt 2) ---------------------------------
  /** Arbeiten im Regal (Startseite), höchstens REGAL_MAX werden gezeigt. Was fehlt, ist für das Kind nicht da. */
  regal: ModusId[];
  /** Stufe im Tier-Modus (F1). Standard 1. Die App steigert nie selbst. */
  tierStufe: TierStufe;
  /**
   * Hilfsschwelle (B3): nach so vielen Fehlversuchen am selben Feld pulsiert die gesuchte Taste
   * (`data-hinweis="ja"`) und der Laut klingt. Standard 2.
   */
  hilfeNach: number;
  /** Gutes Ende (B9): nach so vielen gelungenen Runden kommt die Gute Nacht. Standard 6. Kein sichtbarer Zähler. */
  rundenBisGuteNacht: number;
  /** Anfangsbuchstabe des Kindes (B16/F7) — EIN Buchstabe, nur lokal. */
  kindAnfang?: Buchstabe;

  // ---- Laut ruft Tier (F2) ---------------------------------------------------
  /** Nach dem Laut lugt ein Tier mit genau diesem Anlaut hervor. Standard true. */
  lautRuftTier: boolean;
  /** Tasten des kleinen Kastens (Regal-Variante „laut-ruft-tier“), 4–6 Buchstaben. Leer = automatisch wählen. */
  kastenBuchstaben: Buchstabe[];

  // ---- Decke (F3), Geschichten (F6), Elternzeilen ----------------------------
  /** Stufe des Deckenspiels. Standard 0 (Medaillons). */
  deckeStufe: DeckeStufe;
  /** F6: nach dem richtigen Helfer dessen Anlaut legen (ab Tier-Stufe 1). Standard true. */
  geschichtenSchreiben: boolean;
  /** Kleine graue Elternzeilen („Klatscht mit!“, offene Frage) zeigen. Standard true. */
  elternzeilen: boolean;

  // ---- Tonquellen (B18) ------------------------------------------------------
  /** Live-Stimme für frei Geschriebenes. Standard 'browser'. */
  liveStimme: LiveStimme;
  /** Spracheingabe für Eltern. Standard 'aus'. */
  spracheingabe: Spracheingabe;
  /** Eigener OpenRouter-Schlüssel (nur auf dem Gerät). Nur für liveStimme/spracheingabe = 'openrouter'. */
  openrouterSchluessel?: string;
}

/** Reaktiver Einstellungs-Store (src/kern/einstellungen.ts). */
export interface EinstellungenStore {
  /** Aktueller Stand (immer vollständig, mit Standardwerten aufgefüllt). */
  lese(): Einstellungen;
  /** Teil-Update, speichert sofort und benachrichtigt Abonnenten. */
  setze(teil: Partial<Einstellungen>): void;
  /** Abonnieren; Rückgabe = Abmelden. */
  abonniere(fn: (e: Einstellungen) => void): () => void;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

/**
 * public/audio/manifest.json — erzeugt von tools/vertonen.py (Laute/Namen von tools/laute_ki.py).
 * Alle Pfade RELATIV zur App-Basis (z. B. „audio/laute/m.ki1.mp3“), damit sie unter
 * /abc-werkstatt/ und im Test (request.get) funktionieren.
 */
export interface AudioManifest {
  /** Laut je Buchstabe, z. B. { m: "audio/laute/m.ki1.mp3" } — Standardvariante. */
  laute: Record<Buchstabe, string>;
  /** Buchstabenname je Buchstabe, z. B. { m: "audio/namen/m.mp3" }. */
  namen: Record<Buchstabe, string>;
  /** Wort (kanonisch klein) → Datei, z. B. { igel: "audio/woerter/igel.mp3" }. */
  woerter: Record<string, string>;
  /**
   * Feste Sätze und Geräusche (Konzept 6a): Schlüssel → Varianten (1–4 Dateien).
   * Schlüssel z. B. `kachel.tiere`, `einladung.m`, `lob.allgemein`, `geraeusch.wisch`,
   * `geraeusch.bewegung.huepft`. Gespielt über `AudioDienst.fest()`, nie live.
   */
  saetze: Record<string, string[]>;
  /** Gedehnter Laut je Buchstabe (B13): Dauerlaute 1,5–2 s, Plosive „b-b-b“ ohne Schwa. */
  laute_lang?: Partial<Record<Buchstabe, string>>;
  /** Laut-Varianten je Buchstabe fürs Laut-Studio (mind. 2 für b, d, k, m). */
  varianten?: Partial<Record<Buchstabe, LautVariante[]>>;
  /** Welches Werkzeug die festen Sätze erzeugt hat, z. B. „piper:de_DE-thorsten-high“ (nur Info). */
  stimme?: string;
}

/** Eine auswählbare Aussprache-Variante eines Lauts. */
export interface LautVariante {
  /** Stabile ID innerhalb des Buchstabens, z. B. „ki1“, „ki2“. Landet in data-testid `variante-<b>-<id>`. */
  id: string;
  /** Relativer Pfad, Blob-URL oder `aufnahme:<b>` (Elternaufnahme) — `AudioDienst.datei()` spielt alle ab. */
  url: string;
  /** Anzeige für Eltern, z. B. „kurz, stimmlos“. */
  beschreibung?: string;
  /** Herkunft: vorab vertont oder von Eltern aufgenommen. */
  quelle: 'vorab' | 'aufnahme';
}

/** Wofür eine Elternaufnahme gilt. `text` ist kanonisch klein (Buchstabe oder Wort). */
export interface AudioSchluessel {
  art: 'laut' | 'name' | 'wort';
  text: string;
}

/** Laufende Mikrofon-Aufnahme. */
export interface LaufendeAufnahme {
  /** Beendet und liefert die Aufnahme (z. B. audio/webm). */
  stoppe(): Promise<Blob>;
  /** Verwirft die Aufnahme, gibt das Mikrofon frei. */
  abbrechen(): void;
}

/**
 * Wie eine Ausgabe geendet hat: zu Ende gespielt oder von einer neueren Ausgabe bzw. `stopp()`
 * abgebrochen. Ketten (z. B. Tier-Freude) brechen ab, sobald ein Schritt `abgebrochen` liefert —
 * sonst übertönt der nächste Kettenschritt das, was das Kind gerade angetippt hat.
 */
export type Ausgang = 'fertig' | 'abgebrochen';

/** Ein Schritt einer Sprechkette (`AudioDienst.kette`): startet genau EINE Ausgabe des Audio-Dienstes. */
export type KettenSchritt = () => Promise<Ausgang>;

/**
 * Audio-Dienst (src/audio). Es läuft immer nur EINE Tonquelle: jede Abspiel-Methode beendet die
 * laufende Ausgabe und löst mit `Ausgang` auf (`fertig` nach dem Ende, `abgebrochen`, wenn eine
 * neuere Ausgabe oder `stopp()` sie beendet hat). Geworfen wird bei echten Fehlern (`AudioFehler`).
 * Eine Autoplay-Sperre gilt nur VOR der ersten erfolgreichen Entsperrung als harmlos.
 *
 * Quellen:
 * - FESTE Sätze/Geräusche (`fest`, `lautLang`, `laut`, `name`): nur Dateien aus dem Manifest (bzw.
 *   Elternaufnahme / Laut-Studio-Wahl). Fehlt eine Datei, ist das ein `AudioFehler` — NIE live.
 * - FREI Geschriebenes (`wort` ohne Datei, `live`, `satz`): Elternaufnahme → vorab vertont (nur `wort`)
 *   → Cache → Live-Stimme nach Einstellung `liveStimme` (Browser | Piper offline | OpenRouter).
 * Tier-Paket-Audio spielen die Modi über `variante()`/`datei()` (Hilfe: kern/tierton.ts).
 */
export interface AudioDienst {
  /** Lädt manifest.json (einmalig, idempotent). Muss vor der ersten Ausgabe nicht abgewartet werden. */
  vorab(): Promise<void>;
  /** Spielt den LAUT („mmm“). Erzeugt bei vorab vertonten Lauten einen Request auf audio/laute/<b>….mp3. */
  laut(b: Buchstabe): Promise<Ausgang>;
  /** Gedehnter Laut (B13, `manifest.laute_lang`). Fehlt die Datei: `AudioFehler`. */
  lautLang(b: Buchstabe): Promise<Ausgang>;
  /** Spielt den Buchstaben-NAMEN („em“). */
  name(b: Buchstabe): Promise<Ausgang>;
  /** Laut ODER Name je nach Einstellung `namenStattLaute` — das, was Tasten benutzen. */
  buchstabe(b: Buchstabe): Promise<Ausgang>;
  /** Liest ein ganzes Wort (kanonisch klein). Vorab vertonte Wörter → Request auf audio/woerter/…; sonst live. */
  wort(w: string): Promise<Ausgang>;
  /**
   * Fester Satz bzw. Geräusch aus `manifest.saetze` (B12). `schluessel` darf Platzhalter in
   * geschweiften Klammern enthalten, die aus `platzhalter` ersetzt werden:
   * `fest('einladung.{laut}', { laut: 'm' })` spielt `einladung.m`. Wählt zufällig eine Variante,
   * aber nie dieselbe wie beim letzten Mal für diesen Schlüssel. Unbekannter Schlüssel → `AudioFehler`.
   */
  fest(schluessel: string, platzhalter?: Readonly<Record<string, string>>): Promise<Ausgang>;
  /** Gibt es den festen Satz `schluessel` (nach Laden des Manifests)? Für optionale Geräusche. */
  hatFest(schluessel: string): Promise<boolean>;
  /**
   * Spielt eine von mehreren Datei-URLs (z. B. Paket-Varianten `audio.freude`), nie dieselbe
   * zweimal hintereinander für denselben `schluessel` (frei wählbar, z. B. „<paket>/<tier>/freude“).
   * Leere Liste → `AudioFehler`.
   */
  variante(schluessel: string, urls: readonly string[]): Promise<Ausgang>;
  /**
   * Spielt Schritte nacheinander mit `pauseMs` Stille dazwischen (B11, Standard 1200 ms zum
   * Nachsprechen). Bricht ab (`abgebrochen`), sobald ein Schritt abgebrochen wurde oder während
   * einer Pause eine andere Ausgabe bzw. `stopp()` kam. Fehler eines Schritts werden geworfen.
   */
  kette(schritte: readonly KettenSchritt[], pauseMs?: number): Promise<Ausgang>;
  /** Spricht frei geschriebenen Text über die eingestellte Live-Stimme (6c). Nie für feste Sätze. */
  live(text: string): Promise<Ausgang>;
  /** Wie `live` — älterer Name, z. B. für `kann`-Sätze eines Pakets ohne Audio. */
  satz(text: string): Promise<Ausgang>;
  /** Leises Wisch-Geräusch (`geraeusch.wisch`, B5). */
  wisch(): Promise<Ausgang>;
  /** Spielt eine beliebige Audio-URL (z. B. Blob-URL aus einem Tier-Paket oder `aufnahme:<b>`). */
  datei(url: string): Promise<Ausgang>;
  /** Bricht jede laufende Ausgabe (und Kette) sofort ab. */
  stopp(): void;
  /** Alle Varianten eines Lauts fürs Laut-Studio (vorab + Aufnahme). */
  lautVarianten(b: Buchstabe): Promise<LautVariante[]>;
  /** Startet eine Mikrofonaufnahme (MediaRecorder). Wirft, wenn kein Mikrofon erlaubt ist. */
  aufnahmeStarten(): Promise<LaufendeAufnahme>;
  /** Speichert eine Elternaufnahme in IndexedDB; sie hat danach Vorrang. */
  aufnahmeSpeichern(schluessel: AudioSchluessel, blob: Blob): Promise<void>;
  /** Entfernt eine Elternaufnahme. */
  aufnahmeLoeschen(schluessel: AudioSchluessel): Promise<void>;
  /** Gibt es eine Elternaufnahme? */
  hatAufnahme(schluessel: AudioSchluessel): Promise<boolean>;
  /**
   * Spracheingabe über OpenRouter (B8/B18, Einstellung `spracheingabe = 'openrouter'`):
   * Aufnahme → Text. Ohne Schlüssel `AudioFehler`. Browser-Erkennung macht der Modus selbst (Web Speech).
   */
  transkribiere(aufnahme: Blob): Promise<string>;
}

// ---------------------------------------------------------------------------
// Tier-Pakete (Format: docs/tier-paket.md)
// ---------------------------------------------------------------------------

/** Formatkennung Version 1 — `paket.json` muss genau diesen Wert tragen. Neue Felder sind optional. */
export const TIERPAKET_FORMAT = 'abc-werkstatt-tierpaket/1' as const;

/** Bewegungsarten (F4). Je Art eine eigene Keyframe-Folge und ein Geräusch `geraeusch.bewegung.<art>`. */
export const BEWEGUNGEN = [
  'huepft', 'fliegt', 'kriecht', 'schwimmt', 'rollt', 'klettert', 'watschelt', 'schlaengelt', 'stampft', 'tanzt',
] as const;
export type Bewegung = (typeof BEWEGUNGEN)[number];

/**
 * Audio eines Tiers. Alle Pfade sind Pfade IM Zip (mp3). Listen = Varianten, abgespielt ohne
 * direkte Wiederholung (`AudioDienst.variante`). Alles optional: fehlt ein Feld, nimmt der Modus
 * den dokumentierten Ersatz (z. B. `audio.name` → Wort live) oder lässt den Schritt weg.
 */
export interface TierAudio {
  /** mp3 mit dem gesprochenen Namen. */
  name?: string;
  /** Freude-Varianten (3–4 empfohlen). */
  freude?: string[];
  /** mp3 mit dem „kann“-Satz — dieselbe Stimme wie Name und Freude statt der Live-Stimme. */
  kann?: string;
  /** Name mit gedehntem Anlaut („iiigel“, „{laut_lang} … {tier}“) — F1, F3. */
  anlautName?: string[];
  /** „{laut} … {tier}!“ — F2. Der Laut muss genauso klingen wie der Tastenlaut. */
  lautRuf?: string[];
  /** „Ich fange mit {laut_lang} an!“ — F3. */
  ichFange?: string[];
  /** Je Rätselsatz eine Datei, gleiche Reihenfolge wie `Tier.raetsel` — F3. */
  raetsel?: string[];
  /** „Ich bin {artikel} {tier}!“ — F3. */
  ichBin?: string[];
  /** Je Sprechsilbe eine Datei, gleiche Länge wie `Tier.silben` (sonst ungültig) — F5. */
  silben?: string[];
  /** „Du hast {artikel} {tier} geschrieben!“ — F1. */
  geschrieben?: string[];
  /** Umlenksatz, wenn das Tier nicht der Helfer ist — F6. */
  nichtIch?: string[];
  /** Gute-Nacht-Satz/Gähnen — B9. */
  gaehnen?: string[];
  /** Tierlaut aus der Folge (optional, darf überall fehlen). Klingt nie über Sprache. */
  geraeusch?: string[];
}

/** Name eines Audio-Felds mit Varianten-Liste (alles außer den Einzeldateien `name`/`kann`). */
export type TierAudioListe = Exclude<keyof TierAudio, 'name' | 'kann'>;

/** Audio einer Situation (F6). */
export interface SituationAudio {
  /** Erzählung des Problems (1–2 Varianten). */
  problem?: string[];
  /** Erzählung der Lösung (1–2 Varianten). */
  loesung?: string[];
}

/**
 * Eine kleine Geschichte (F6 „Wer hilft?“). Steht beim PROBLEMTIER (`Tier.situationen`);
 * `helfer` ist die id eines anderen Tiers im selben Paket (sonst ist das Paket ungültig).
 */
export interface Situation {
  /** Eindeutig im Paket, [a-z0-9-]+. Landet in `data-situation`. */
  id: string;
  /** Problem als Text (1–300 Zeichen), für Eltern lesbar und als Vorlage der Vertonung. */
  problem: string;
  /** Tier-id des Helfers im selben Paket. */
  helfer: string;
  /** Lösung als Text (1–300 Zeichen). */
  loesung: string;
  audio?: SituationAudio;
}

/** Ein Tier, wie es in paket.json steht. Pfade sind Pfade IM Zip. */
export interface Tier {
  /** Eindeutig im Paket, [a-z0-9-]+. */
  id: string;
  /** Anzeigename mit Großbuchstaben/Umlauten, z. B. „Bär“. Schreibwort = schreibwort(name). */
  name: string;
  artikel: 'der' | 'die' | 'das';
  /** Bildpfad im Zip (webp, png, jpg, svg). */
  bild: string;
  /** Satz, was das Tier kann (wird vorgelesen). */
  kann?: string;
  /** Satz, den das Tier sagt, wenn das Wort geschafft ist. */
  freude?: string;
  /**
   * Gesprochener Anlaut als LAUT (F0): ein Buchstabe des Alphabets („m“) oder ein Phonogramm
   * („sch“, „schp“, „scht“, „ei“, „eu“, „au“, „pf“, „z-stimmhaft“ …), 1–12 Zeichen [a-zäöüß-].
   * Nur ein Einzelbuchstabe, der zum ersten Buchstaben des Schreibworts passt, macht das Tier zum
   * Anlaut-Tier (`anlautBuchstabe()` in src/paket/anlaut.ts). Fehlt das Feld: nie Anlaut-Tier.
   */
  anlaut?: string;
  /** Sprechsilben, von Hand gepflegt („i“, „gel“). Ohne Feld kein Silben-Hüpfen (F5). */
  silben?: string[];
  /** Bewegungsart (F4). Ohne Feld: das heutige Hüpfen. */
  bewegung?: Bewegung;
  /** 1–3 kurze Rätselsätze ohne den Namen (F3). */
  raetsel?: string[];
  /** Geschichten, in denen DIESES Tier das Problem hat (F6). */
  situationen?: Situation[];
  audio?: TierAudio;
}

/** Inhalt von paket.json. */
export interface TierPaketDatei {
  format: typeof TIERPAKET_FORMAT;
  /** Eindeutig je Gerät, [a-z0-9-]+ — erneuter Import gleicher id ersetzt das Paket. */
  id: string;
  titel: string;
  untertitel?: string;
  /** Coverbild-Pfad im Zip. */
  cover?: string;
  sprache: 'de-DE';
  tiere: Tier[];
}

/** Ein installiertes Paket (Metadaten; Dateien liegen getrennt in IndexedDB). */
export interface TierPaket extends TierPaketDatei {
  /** Zeitpunkt des Imports (ms seit Epoche). */
  installiertAm: number;
}

/** Treffer bei der Suche nach einem Tier über sein Schreibwort. */
export interface TierTreffer {
  paket: TierPaket;
  tier: Tier;
}

/** Ein Anlaut-Tier (F0/F2/F3): Tier mit gültigem Einzel-Anlaut. */
export interface AnlautTreffer extends TierTreffer {
  /** Der Anlaut als Buchstabe (= erster Buchstabe des Schreibworts). */
  laut: Buchstabe;
}

/** Eine Situation mit ihrem Problemtier und dem aufgelösten Helfer (F6). */
export interface SituationTreffer {
  paket: TierPaket;
  problemtier: Tier;
  helfer: Tier;
  situation: Situation;
}

/**
 * Paket-Dienst (src/paket). Speichert in IndexedDB (idb-keyval, eigener Store).
 * Alle Methoden werfen `PaketFehler` mit verständlicher deutscher Meldung für Eltern.
 */
export interface PaketDienst {
  /** Importiert ein Zip (File oder Blob), validiert nach docs/tier-paket.md, speichert, liefert das Paket. */
  importiereZip(datei: Blob): Promise<TierPaket>;
  /** Alle installierten Pakete, sortiert nach Titel. */
  liste(): Promise<TierPaket[]>;
  /** Ein Paket oder undefined. */
  hole(id: string): Promise<TierPaket | undefined>;
  /**
   * Entfernt ein Paket aus der Liste (und aus `findeTier`). Es bleibt im Papierkorb, bis zum
   * nächsten Löschen oder Import — so lange holt `stelleWiederHer` es zurück. Erst dann werden
   * seine Dateien endgültig entfernt. Gibt Blob-URLs frei.
   */
  loesche(id: string): Promise<void>;
  /** Holt das zuletzt gelöschte Paket zurück; wirft `PaketFehler`, wenn es nicht mehr da ist. */
  stelleWiederHer(id: string): Promise<TierPaket>;
  /** Blob-URL eines Bildes im Paket (gecacht, gleiche URL bei gleichem Pfad). */
  bildUrl(paketId: string, pfad: string): Promise<string>;
  /** Blob-URL einer Audiodatei im Paket. */
  audioUrl(paketId: string, pfad: string): Promise<string>;
  /** Sucht über ALLE Pakete ein Tier, dessen Schreibwort genau `wort` ist (kanonisch klein). */
  findeTier(wort: string): Promise<TierTreffer | undefined>;
  /** Benachrichtigt nach Import/Löschen. Rückgabe = Abmelden. */
  abonniere(fn: () => void): () => void;
}

// ---------------------------------------------------------------------------
// Wörterbuch
// ---------------------------------------------------------------------------

/**
 * Wörterbuch-Store (src/kern/woerter.ts, IndexedDB). Beim allerersten Start mit
 * STARTWOERTER gefüllt; wer alles löscht, bekommt sie NICHT automatisch zurück.
 */
export interface WoerterDienst {
  /** Alle Wörter, kanonisch klein, alphabetisch. */
  liste(): Promise<string[]>;
  /** Normalisiert (trim, klein), prüft (nur Buchstaben aus LAUTE, 2–20 Zeichen), speichert. Wirft `WortFehler`. */
  hinzufuegen(wort: string): Promise<string>;
  /** Entfernt ein Wort (kein Fehler, wenn es fehlt). */
  loeschen(wort: string): Promise<void>;
  /** Fürs Üben abgewählte Wörter (kanonisch klein, alphabetisch). */
  pausierte(): Promise<string[]>;
  /** Wort fürs Üben an- (`true`) oder abwählen (`false`). Benachrichtigt Abonnenten. */
  setzeUeben(wort: string, ueben: boolean): Promise<void>;
  /**
   * Zufälliges Übungswort, möglichst ungleich `ausser`; pausierte Wörter werden übersprungen.
   * Sind ALLE Wörter pausiert, wird unter allen gewählt (die Auswahl ist eine Vorliebe, keine Sperre).
   * undefined nur bei leerer Liste.
   */
  zufall(ausser?: string): Promise<string | undefined>;
  /** Benachrichtigt nach Änderungen. Rückgabe = Abmelden. */
  abonniere(fn: () => void): () => void;
}

// ---------------------------------------------------------------------------
// Meine Leute (F7) — nur lokal, nie Export/Paket
// ---------------------------------------------------------------------------

/** Höchstens so viele Personen legt Papa an (F7). */
export const LEUTE_MAX = 8;

/** Eine Person (Metadaten). Foto und Aufnahme liegen getrennt als Blob in IndexedDB. */
export interface Person {
  /** Vom Store vergeben, [a-z0-9-]+. Landet in data-testid `leute-<id>`. */
  id: string;
  /** Schreibwort, kanonisch klein, nur Buchstaben aus LAUTE, 2–20 Zeichen (z. B. „mama“). */
  wort: string;
  /** true = es gibt eine Elternaufnahme des Worts. */
  hatAufnahme: boolean;
  /** true = Eintrag für den Anfangsbuchstaben des Kindes (`kindAnfang`). */
  kind?: boolean;
  angelegtAm: number;
}

/** Neue Person anlegen bzw. ändern. Foto wird vom Store auf ≈ 512 px (webp/jpeg) verkleinert. */
export interface PersonEingabe {
  wort: string;
  foto: Blob;
  aufnahme?: Blob;
  kind?: boolean;
}

/** Store der Familienwörter (src/kern/leute.ts). Wirft `WortFehler` bzw. `LeuteFehler`. */
export interface LeuteDienst {
  /** Alle Personen in Anlege-Reihenfolge. */
  liste(): Promise<Person[]>;
  hole(id: string): Promise<Person | undefined>;
  /** Legt an (höchstens LEUTE_MAX, sonst `LeuteFehler`). */
  anlegen(eingabe: PersonEingabe): Promise<Person>;
  /** Ändert Wort/Foto/Aufnahme (nur übergebene Felder). */
  aendern(id: string, teil: Partial<PersonEingabe>): Promise<Person>;
  loeschen(id: string): Promise<void>;
  /** Blob-URL des Fotos (gecacht). */
  fotoUrl(id: string): Promise<string>;
  /** Blob-URL der Aufnahme oder undefined. */
  aufnahmeUrl(id: string): Promise<string | undefined>;
  abonniere(fn: () => void): () => void;
}

// ---------------------------------------------------------------------------
// Sitzungsnotizen (B16 „heute dran“, nur für Eltern)
// ---------------------------------------------------------------------------

/** Was in einer Sitzung vorkam. Keine Zahl für das Kind, nur Gesprächsanlass für Eltern. */
export interface Notiz {
  art: 'laut' | 'tier' | 'wort';
  /** Buchstabe, Tiername oder Wort. */
  wert: string;
}

/** Merkt sich Laute/Tiere/Wörter der laufenden und der letzten Sitzung (src/kern/notizen.ts, localStorage). */
export interface NotizDienst {
  /** Notiert etwas für „heute dran“ (dedupliziert). */
  merke(n: Notiz): void;
  /** Notizen der aktuellen Sitzung (seit App-Start), sonst der letzten. */
  heuteDran(): Notiz[];
}

// ---------------------------------------------------------------------------
// Router und Modi
// ---------------------------------------------------------------------------

/** Was jeder Modus beim Mount bekommt. */
export interface Kontext {
  audio: AudioDienst;
  pakete: PaketDienst;
  woerter: WoerterDienst;
  einstellungen: EinstellungenStore;
  leute: LeuteDienst;
  notizen: NotizDienst;
  /** Alle registrierten Modi (z. B. für Regal-Auswahl, Begleitkarten und Elternabschnitte in den Einstellungen). */
  modi: readonly Modus[];
  /** Navigation: `navigiere('start')`, `navigiere('frei')`, `navigiere('tiere', paketId)`. */
  navigiere(ziel: ModusId | 'start', param?: string): void;
  /** Routen-Parameter (z. B. Paket-ID im Tier-Modus), sonst undefined. */
  param?: string;
  /** Setzt den Titel in der Kopfzeile (z. B. Paket-Titel). */
  setzeTitel(text: string): void;
}

/** Dienste ohne Routen-Teil — das, was Start, Regal und `verfuegbar()` bekommen. */
export type Dienste = Omit<Kontext, 'navigiere' | 'param' | 'setzeTitel' | 'modi'>;

/** Eine Kachel im Regal (aus `Modus.kacheln`). */
export interface RegalKachel {
  /** Routen-Parameter beim Öffnen (z. B. Paket-ID im Tier-Modus). */
  param?: string;
  /** Titel unter dem Bild (für Eltern; das Kind hört `kachel.<id>`). */
  titel: string;
  /** Kleine zweite Zeile (z. B. Paket-Untertitel). */
  untertitel?: string;
  /** Blob-/Daten-URL eines Bildes; ohne: das Icon des Modus. */
  bildUrl?: string;
  /** Zusätzliche data-*-Attribute an der Kachel, z. B. { 'data-paket': 'testtiere' }. */
  daten?: Record<string, string>;
}

/**
 * Ein Modus (Bildschirm). Der Router baut Kopfzeile (mit `zurueck`) und ruft `mount`
 * mit der leeren Fläche auf; beim Verlassen `unmount` — dort ALLE Listener/Timer/Audio
 * aufräumen (insbesondere document-Keydown-Listener).
 */
export interface Modus {
  id: ModusId;
  /** Titel in der Kopfzeile und auf der Kachel. */
  titel: string;
  icon: IconName;
  /** Wohin `zurueck` führt; Standard 'start'. */
  zurueckZu?: ModusId | 'start';
  /**
   * true = Elternbereich (Wörterbuch, Einstellungen, Laut-Studio): normaler Zurück-Knopf, keine
   * History-Falle, kein Wake Lock. Sonst Kind-Modus (B7): Zurück nur nach 1 s Halten, Android-Zurück
   * wird abgefangen, Bildschirm bleibt an.
   */
  fuerEltern?: boolean;
  /**
   * Kacheln dieses Modus im Regal. Ohne Methode: genau eine Kachel mit `titel`/`icon`.
   * Leere Liste = Modus steht gerade nicht zur Verfügung (z. B. kein Paket mit Situationen) und
   * fehlt im Regal — nicht ausgegraut, einfach nicht da.
   */
  kacheln?(dienste: Dienste): Promise<RegalKachel[]>;
  /** Begleitkarte für Eltern (B16): 2–3 Sätze, wird im Elternbereich gezeigt. */
  begleitkarte?: string;
  /** Eigener Abschnitt im Elternbereich (z. B. F7 „Meine Leute“ anlegen). Wird in den Einstellungen eingehängt. */
  elternAbschnitt?(ctx: Kontext): HTMLElement;
  /** Mount in die leere Fläche `el`. Darf async sein; Fehler zeigt der Router ruhig an. */
  mount(el: HTMLElement, ctx: Kontext): void | Promise<void>;
  /** Aufräumen. Muss idempotent sein. */
  unmount(): void;
}

// ---------------------------------------------------------------------------
// Bildschirm-Alphabet (src/ui/alphabet.ts)
// ---------------------------------------------------------------------------

export interface AlphabetOptionen {
  /** Anzeige in Großbuchstaben (Einstellung `grossbuchstaben`). data-testid bleibt `taste-<klein>`. */
  grossbuchstaben: boolean;
  /** Aufruf bei Antippen ODER passendem Tastendruck der echten Tastatur (ohne Auto-Repeat). */
  beiTaste(b: Buchstabe): void;
  /** Backspace (echte Tastatur oder Löschtaste). Ohne Handler keine Löschtaste. */
  beiLoeschen?(): void;
  /** Leertaste. Ohne Handler keine Leertaste. */
  beiLeertaste?(): void;
  /** Echte Tastatur auf document abhören (Standard true). Wird in zerstoere() abgemeldet. */
  tastatur?: boolean;
  /** Nur diese Buchstaben zeigen (in Alphabet-Reihenfolge). Standard: alle aus LAUTE. */
  buchstaben?: readonly Buchstabe[];
  /** Große Tasten (2–6 Tasten: F1 Stufe 1, kleiner Kasten, Decke Stufe 1). Standard false. */
  gross?: boolean;
}

/** Instanz des Bildschirm-Alphabets. */
export interface AlphabetKomponente {
  /** Wurzel-Element zum Einhängen. Tasten tragen data-testid `taste-<b>` und data-art vokal|konsonant. */
  el: HTMLElement;
  /** Sanftes Wackeln einer Taste (Fehlerkontrolle im Material, kein Fehlerton). */
  wackle(b: Buchstabe): void;
  /** Großbuchstaben-Anzeige umschalten. */
  setzeGross(gross: boolean): void;
  /** Hilfe (B3): Taste pulsiert und trägt `data-hinweis="ja"`; `false` nimmt es zurück. */
  hinweis(b: Buchstabe, an: boolean): void;
  /** Listener abmelden, DOM entfernen. */
  zerstoere(): void;
}

/** Fabrik-Signatur, exportiert als `erzeugeAlphabet` aus src/ui/alphabet.ts. */
export type ErzeugeAlphabet = (opt: AlphabetOptionen) => AlphabetKomponente;

// ---------------------------------------------------------------------------
// Rückmeldung (gemeinsamer Testvertrag für Nachfüllen und Tiere)
// ---------------------------------------------------------------------------

/**
 * Element mit data-testid="rueckmeldung" trägt data-art:
 * - `leer`      Ausgangszustand
 * - `richtig`   ein Buchstabe passte
 * - `falsch`    Buchstabe passte nicht (Taste wackelt, springt zurück — kein rotes X, kein Ton)
 * - `geschafft` Wort fertig
 */
export type RueckmeldungsArt = 'leer' | 'richtig' | 'falsch' | 'geschafft';

// ---------------------------------------------------------------------------
// Fehler
// ---------------------------------------------------------------------------

/** Paket ungültig oder Speichern fehlgeschlagen. `message` ist für Eltern lesbar. */
export class PaketFehler extends Error {
  override name = 'PaketFehler';
}

/** Wort ungültig (leer, Zeichen außerhalb LAUTE, zu lang). */
export class WortFehler extends Error {
  override name = 'WortFehler';
}

/** Audio konnte nicht abgespielt/erzeugt werden. */
export class AudioFehler extends Error {
  override name = 'AudioFehler';
}

/** „Meine Leute“: Speichern/Lesen fehlgeschlagen oder zu viele Personen. */
export class LeuteFehler extends Error {
  override name = 'LeuteFehler';
}
