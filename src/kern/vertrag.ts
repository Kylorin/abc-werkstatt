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

// ---------------------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------------------

/** Alles, was Eltern einstellen können. Persistiert lokal im Gerät. */
export interface Einstellungen {
  /** true = Buchstabennamen („em“) statt Laute („mmm“). Montessori-Standard: false. */
  namenStattLaute: boolean;
  /** true = Großbuchstaben anzeigen. Montessori-Standard: false (Kleinbuchstaben). */
  grossbuchstaben: boolean;
  /** Eigener Azure-Speech-Schlüssel für Live-Vertonung neuer Wörter (nur im Gerät gespeichert). */
  azureSchluessel?: string;
  /** Azure-Region, z. B. „westeurope“. */
  azureRegion?: string;
  /** Azure-Stimmenname, z. B. „de-DE-KatjaNeural“. */
  stimme: string;
  /** Optional: Name des Kindes (nur lokal, nie im Repo), z. B. für Begrüßung im Tier-Modus. */
  kindName?: string;
  /** Tier-Modus: true = Wort als Vorlage mit Feldern (wie Nachfüllen), false = frei aus dem Kopf. */
  tierModusMitVorlage: boolean;
  /** Im Laut-Studio gewählte Variante je Buchstabe: Buchstabe → URL der Audiodatei (oder `aufnahme:<b>` / `azure:<b>`). */
  gewaehlteLautVarianten: Partial<Record<Buchstabe, string>>;
  /**
   * Elternsperre: in der INSTALLIERTEN App (Startbildschirm) öffnen sich Wörterbuch und
   * Einstellungen erst nach langem Drücken. Im normalen Browser-Tab gilt sie nicht. Standard: true.
   */
  elternsperre: boolean;
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
 * public/audio/manifest.json — vom Bau „audio“ (tools/vertonen.py) erzeugt.
 * Alle Pfade RELATIV zur App-Basis (z. B. „audio/laute/m-ki1.mp3“), damit sie unter
 * /abc-werkstatt/ und im Test (request.get) funktionieren.
 */
export interface AudioManifest {
  /** Laut je Buchstabe, z. B. { m: "audio/laute/m-ki1.mp3" } — Standardvariante. */
  laute: Record<Buchstabe, string>;
  /** Buchstabenname je Buchstabe, z. B. { m: "audio/namen/m.mp3" }. */
  namen: Record<Buchstabe, string>;
  /** Wort (kanonisch klein) → Datei, z. B. { igel: "audio/woerter/igel.mp3" }. */
  woerter: Record<string, string>;
  /** Kurze Sätze/Floskeln (Schlüssel frei, z. B. „geschafft“, „nochmal“). */
  saetze?: Record<string, string>;
  /** Laut-Varianten je Buchstabe fürs Laut-Studio (mind. 2 für b, d, k, m). */
  varianten?: Partial<Record<Buchstabe, LautVariante[]>>;
}

/** Eine auswählbare Aussprache-Variante eines Lauts. */
export interface LautVariante {
  /** Stabile ID innerhalb des Buchstabens, z. B. „ki1“, „ki2“. Landet in data-testid `variante-<b>-<id>`. */
  id: string;
  /**
   * Relativer Pfad, Blob-URL oder eine der Sonderformen `aufnahme:<b>` (Elternaufnahme) bzw.
   * `azure:<b>` (live über den eigenen Azure-Schlüssel) — `AudioDienst.datei()` spielt alle ab.
   */
  url: string;
  /** Anzeige für Eltern, z. B. „kurz, stimmlos“. */
  beschreibung?: string;
  /** Herkunft: vorab vertont, live über Azure erzeugt oder von Eltern aufgenommen. */
  quelle: 'vorab' | 'azure' | 'aufnahme';
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

/**
 * Audio-Dienst (Bau „audio“, src/audio). Reihenfolge der Quellen je Ausgabe:
 * Elternaufnahme → gewählte Laut-Variante → vorab vertont (manifest) → Cache live → Azure live
 * (nur mit eigenem Schlüssel) → Browserstimme (speechSynthesis) als letzte Stufe.
 *
 * Alle Abspiel-Methoden beenden eine laufende Ausgabe (kein Überlappen) und lösen mit
 * `Ausgang` auf: `fertig` nach dem Ende, `abgebrochen`, wenn eine neuere Ausgabe oder `stopp()`
 * sie beendet hat. Sie werfen bei echten Fehlern (Datei kaputt). Eine Autoplay-Sperre gilt nur
 * VOR der ersten erfolgreichen Entsperrung als harmlos (`abgebrochen`), danach als `AudioFehler`.
 */
export interface AudioDienst {
  /** Lädt manifest.json (einmalig, idempotent). Muss vor der ersten Ausgabe nicht abgewartet werden. */
  vorab(): Promise<void>;
  /** Spielt den LAUT („mmm“). Erzeugt bei vorab vertonten Lauten einen Request auf audio/laute/<b>….mp3. */
  laut(b: Buchstabe): Promise<Ausgang>;
  /** Spielt den Buchstaben-NAMEN („em“). */
  name(b: Buchstabe): Promise<Ausgang>;
  /** Laut ODER Name je nach Einstellung `namenStattLaute` — das, was Tasten benutzen. */
  buchstabe(b: Buchstabe): Promise<Ausgang>;
  /** Liest ein ganzes Wort (kanonisch klein). Vorab vertonte Wörter → Request auf audio/woerter/…. */
  wort(w: string): Promise<Ausgang>;
  /** Spricht beliebigen Text (Satz, Freude, Tiername mit Artikel). */
  satz(text: string): Promise<Ausgang>;
  /** Spielt eine beliebige Audio-URL (z. B. Blob-URL aus einem Tier-Paket). */
  datei(url: string): Promise<Ausgang>;
  /** Bricht jede laufende Ausgabe sofort ab. */
  stopp(): void;
  /** Alle Varianten eines Lauts fürs Laut-Studio (vorab + Aufnahme + ggf. Azure). */
  lautVarianten(b: Buchstabe): Promise<LautVariante[]>;
  /** Startet eine Mikrofonaufnahme (MediaRecorder). Wirft, wenn kein Mikrofon erlaubt ist. */
  aufnahmeStarten(): Promise<LaufendeAufnahme>;
  /** Speichert eine Elternaufnahme in IndexedDB; sie hat danach Vorrang. */
  aufnahmeSpeichern(schluessel: AudioSchluessel, blob: Blob): Promise<void>;
  /** Entfernt eine Elternaufnahme. */
  aufnahmeLoeschen(schluessel: AudioSchluessel): Promise<void>;
  /** Gibt es eine Elternaufnahme? */
  hatAufnahme(schluessel: AudioSchluessel): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Tier-Pakete (Format: docs/tier-paket.md)
// ---------------------------------------------------------------------------

/** Formatkennung Version 1 — `paket.json` muss genau diesen Wert tragen. */
export const TIERPAKET_FORMAT = 'abc-werkstatt-tierpaket/1' as const;

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
  audio?: {
    /** mp3 mit dem gesprochenen Namen. */
    name?: string;
    /** mp3s der Freude (eines wird zufällig gespielt). */
    freude?: string[];
    /** mp3 mit dem „kann“-Satz — dieselbe Stimme wie Name und Freude statt der Gerätestimme. */
    kann?: string;
  };
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

/**
 * Paket-Dienst (Bau „paket“, src/paket). Speichert in IndexedDB (idb-keyval, eigener Store).
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
// Router und Modi
// ---------------------------------------------------------------------------

/** Bekannte Modus-IDs. Hash-Route ist `#/<id>` bzw. `#/<id>/<param>`. */
export type ModusId = 'frei' | 'nachfuellen' | 'tiere' | 'woerterbuch' | 'einstellungen' | 'laut-studio';

/** Was jeder Modus beim Mount bekommt. */
export interface Kontext {
  audio: AudioDienst;
  pakete: PaketDienst;
  woerter: WoerterDienst;
  einstellungen: EinstellungenStore;
  /** Navigation: `navigiere('start')`, `navigiere('frei')`, `navigiere('tiere', paketId)`. */
  navigiere(ziel: ModusId | 'start', param?: string): void;
  /** Routen-Parameter (z. B. Paket-ID im Tier-Modus), sonst undefined. */
  param?: string;
  /** Setzt den Titel in der Kopfzeile (z. B. Paket-Titel). */
  setzeTitel(text: string): void;
}

/**
 * Ein Modus (Bildschirm). Der Router baut Kopfzeile (mit `zurueck`) und ruft `mount`
 * mit der leeren Fläche auf; beim Verlassen `unmount` — dort ALLE Listener/Timer/Audio
 * aufräumen (insbesondere document-Keydown-Listener).
 */
export interface Modus {
  id: ModusId;
  /** Titel in der Kopfzeile und (falls auf dem Start) auf der Kachel. */
  titel: string;
  icon: IconName;
  /** Wohin `zurueck` führt; Standard 'start'. */
  zurueckZu?: ModusId | 'start';
  /** Mount in die leere Fläche `el`. Darf async sein; Fehler zeigt der Router ruhig an. */
  mount(el: HTMLElement, ctx: Kontext): void | Promise<void>;
  /** Aufräumen. Muss idempotent sein. */
  unmount(): void;
}

// ---------------------------------------------------------------------------
// Bildschirm-Alphabet (src/ui/alphabet.ts, Bau „schreiben“)
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
}

/** Instanz des Bildschirm-Alphabets. */
export interface AlphabetKomponente {
  /** Wurzel-Element zum Einhängen. Tasten tragen data-testid `taste-<b>` und data-art vokal|konsonant. */
  el: HTMLElement;
  /** Sanftes Wackeln einer Taste (Fehlerkontrolle im Material, kein Fehlerton). */
  wackle(b: Buchstabe): void;
  /** Großbuchstaben-Anzeige umschalten. */
  setzeGross(gross: boolean): void;
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
