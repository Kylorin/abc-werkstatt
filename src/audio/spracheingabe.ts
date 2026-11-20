/**
 * Spracheingabe (B8/B18) — nur, wenn Eltern sie in den Einstellungen (hinter der Elternsperre)
 * einschalten. Nie als Richter über die Aussprache des Kindes: Das Ergebnis ist nur Text, der
 * vorgelesen bzw. geschrieben wird.
 *
 * Wege nach Einstellung `spracheingabe`:
 * - 'aus'        → kein Knopf (`spracheingabeMoeglich` = false),
 * - 'browser'    → Web Speech API des Browsers (Daten gehen an den Dienst des Browsers),
 * - 'openrouter' → Mikrofonaufnahme (MediaRecorder) → `AudioDienst.transkribiere` (eigener Schlüssel).
 *
 * Ein Lauf meldet genau einmal `beiEnde`, vorher höchstens einmal `beiText` oder `beiFehler`.
 */
import { AudioFehler, type AudioDienst, type Einstellungen, type LaufendeAufnahme } from '../kern/vertrag';

/** Längste OpenRouter-Aufnahme; danach wird automatisch aufgeschrieben. */
export const SPRACHEINGABE_MAX_MS = 8000;

interface ErkennungsErgebnis {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}
interface ErkennungsFehler {
  error: string;
}
interface Spracherkennung {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((ev: ErkennungsErgebnis) => void) | null;
  onerror: ((ev: ErkennungsFehler) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpracherkennungKonstruktor = new () => Spracherkennung;

function erkennungKonstruktor(): SpracherkennungKonstruktor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpracherkennungKonstruktor; webkitSpeechRecognition?: SpracherkennungKonstruktor };
  // Zwei Namen derselben API (Standard und WebKit-Präfix), kein inhaltlicher Ersatzweg.
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERKENNUNGS_MELDUNGEN: Record<string, string> = {
  'not-allowed': 'Das Mikrofon ist nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.',
  'service-not-allowed': 'Die Spracheingabe ist in diesem Browser nicht erlaubt.',
  'audio-capture': 'Es wurde kein Mikrofon gefunden.',
  network: 'Die Spracheingabe des Browsers braucht gerade eine Internetverbindung.',
};

/** Soll ein Spracheingabe-Knopf erscheinen? ('aus' → nie; sonst nur, wenn das Gerät es kann.) */
export function spracheingabeMoeglich(e: Einstellungen): boolean {
  if (e.spracheingabe === 'browser') return erkennungKonstruktor() !== undefined;
  if (e.spracheingabe === 'openrouter') {
    return !!e.openrouterSchluessel?.trim() && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }
  return false;
}

/** Warum die gewählte Spracheingabe auf diesem Gerät nicht geht (für Eltern) — oder undefined. */
export function spracheingabeHinderungsgrund(e: Einstellungen): string | undefined {
  if (e.spracheingabe === 'aus') return undefined;
  if (e.spracheingabe === 'browser' && !erkennungKonstruktor()) return 'Dieser Browser hat keine eigene Spracheingabe. Bitte „über OpenRouter“ wählen oder ausschalten.';
  if (e.spracheingabe === 'openrouter' && !e.openrouterSchluessel?.trim()) return 'Für die Spracheingabe über OpenRouter fehlt noch der eigene Schlüssel.';
  if (e.spracheingabe === 'openrouter' && (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia)) {
    return 'Dieses Gerät kann hier nicht aufnehmen.';
  }
  return undefined;
}

export interface SpracheingabeHoerer {
  /** Aufgeschriebener Text (roh, ungefiltert; der Modus normiert ihn). Leer = nichts verstanden. */
  beiText(text: string): void;
  /** Echter Fehler (Mikrofon, Netz, Schlüssel …) — sichtbar melden. */
  beiFehler(f: unknown): void;
  /** Lauf vorbei (immer genau einmal). */
  beiEnde(): void;
  /** Optional: Zustand für die Anzeige, z. B. „hört zu“ → „schreibt auf“. */
  beiZustand?(z: 'hoert' | 'schreibt'): void;
}

export interface SpracheingabeLauf {
  /** Zuhören beenden und aufschreiben lassen. */
  fertig(): void;
  /** Alles verwerfen, kein Ergebnis. */
  abbrechen(): void;
}

/** Startet einen Spracheingabe-Lauf nach Einstellung. Wirft, wenn sie aus ist oder hier nicht geht. */
export async function starteSpracheingabe(audio: AudioDienst, e: Einstellungen, h: SpracheingabeHoerer): Promise<SpracheingabeLauf> {
  const grund = spracheingabeHinderungsgrund(e);
  if (grund) throw new AudioFehler(grund);
  if (e.spracheingabe === 'browser') return browserLauf(audio, h);
  if (e.spracheingabe === 'openrouter') return openrouterLauf(audio, h);
  throw new AudioFehler('Die Spracheingabe ist ausgeschaltet.');
}

function browserLauf(audio: AudioDienst, h: SpracheingabeHoerer): SpracheingabeLauf {
  const Erkennung = erkennungKonstruktor();
  if (!Erkennung) throw new AudioFehler('Dieser Browser hat keine eigene Spracheingabe.');
  const r = new Erkennung();
  r.lang = 'de-DE';
  r.interimResults = false;
  r.continuous = false;
  r.maxAlternatives = 1;
  let gemeldet = false;
  r.onresult = (ev) => {
    if (gemeldet) return;
    gemeldet = true;
    h.beiText(ev.results[0]?.[0]?.transcript ?? '');
  };
  r.onerror = (ev) => {
    if (ev.error === 'aborted' || ev.error === 'no-speech' || gemeldet) return; // abgebrochen bzw. still geblieben
    gemeldet = true;
    h.beiFehler(new AudioFehler(ERKENNUNGS_MELDUNGEN[ev.error] ?? `Spracheingabe gestört (${ev.error}).`));
  };
  r.onend = () => h.beiEnde();
  audio.stopp();
  r.start();
  h.beiZustand?.('hoert');
  return { fertig: () => r.stop(), abbrechen: () => r.abort() };
}

async function openrouterLauf(audio: AudioDienst, h: SpracheingabeHoerer): Promise<SpracheingabeLauf> {
  const aufnahme: LaufendeAufnahme = await audio.aufnahmeStarten();
  h.beiZustand?.('hoert');
  let vorbei = false;
  const ende = (): void => {
    if (vorbei) return;
    vorbei = true;
    window.clearTimeout(uhr);
    h.beiEnde();
  };
  let stoppt = false;
  const fertig = (): void => {
    if (vorbei || stoppt) return;
    stoppt = true;
    window.clearTimeout(uhr);
    h.beiZustand?.('schreibt');
    aufnahme
      .stoppe()
      .then((blob) => audio.transkribiere(blob))
      .then(
        (text) => {
          if (!vorbei) h.beiText(text);
        },
        (f: unknown) => {
          if (!vorbei) h.beiFehler(f);
        },
      )
      .finally(ende);
  };
  const uhr = window.setTimeout(fertig, SPRACHEINGABE_MAX_MS);
  return {
    fertig,
    abbrechen: () => {
      aufnahme.abbrechen();
      ende();
    },
  };
}
