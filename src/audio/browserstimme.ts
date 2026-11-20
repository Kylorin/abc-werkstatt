/**
 * Letzte Stufe: die Sprachausgabe des Browsers (speechSynthesis), de-DE.
 * Bevorzugt natürliche Stimmen („Natural", „Online", „Premium", „Enhanced").
 */
import { AudioFehler, type Ausgang } from '../kern/vertrag';

/** Startet die Sprachausgabe nicht binnen dieser Zeit, ist sie gestört (sonst hinge jede Kette ewig). */
const START_FRIST_MS = 3000;

const GUT = /natural|online|premium|enhanced|neural/i;

function stimmen(): Promise<SpeechSynthesisVoice[]> {
  const jetzt = speechSynthesis.getVoices();
  if (jetzt.length) return Promise.resolve(jetzt);
  // Chrome lädt die Liste asynchron nach.
  return new Promise((ok) => {
    const fertig = (): void => {
      speechSynthesis.removeEventListener('voiceschanged', fertig);
      clearTimeout(uhr);
      ok(speechSynthesis.getVoices());
    };
    const uhr = setTimeout(fertig, 1000);
    speechSynthesis.addEventListener('voiceschanged', fertig);
  });
}

/** Beste deutsche Stimme oder undefined (dann nimmt der Browser seine Standardstimme für lang=de-DE). */
async function besteStimme(): Promise<SpeechSynthesisVoice | undefined> {
  const de = (await stimmen()).filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('de'));
  return de.find((v) => GUT.test(v.name) && v.lang === 'de-DE') ?? de.find((v) => GUT.test(v.name)) ?? de.find((v) => v.lang === 'de-DE') ?? de[0];
}

export function browserstimmeVerfuegbar(): boolean {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

/**
 * Spricht `text`. Löst mit `fertig` auf, wenn gesprochen, mit `abgebrochen` bei Abbruch (`signal`).
 * `not-allowed` (Autoplay-Sperre) ist nur harmlos, solange `entsperrt()` noch false ist.
 * Startet die Ausgabe nicht innerhalb von START_FRIST_MS, wird ein AudioFehler geworfen.
 */
export async function sprich(text: string, signal: AbortSignal, entsperrt: () => boolean): Promise<Ausgang> {
  if (!browserstimmeVerfuegbar()) throw new AudioFehler('Dieses Gerät hat keine Sprachausgabe.');
  const stimme = await besteStimme();
  if (signal.aborted) return 'abgebrochen';
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 0.85;
  if (stimme) u.voice = stimme;
  return new Promise<Ausgang>((ok, fehler) => {
    let erledigt = false;
    const schluss = (): void => {
      erledigt = true;
      clearTimeout(frist);
      signal.removeEventListener('abort', abbruch);
    };
    const abbruch = (): void => {
      if (erledigt) return;
      schluss();
      speechSynthesis.cancel();
      ok('abgebrochen');
    };
    const frist = setTimeout(() => {
      if (erledigt) return;
      schluss();
      speechSynthesis.cancel();
      fehler(new AudioFehler('Die Sprachausgabe des Geräts antwortet nicht.'));
    }, START_FRIST_MS);
    u.onstart = () => clearTimeout(frist);
    u.onend = () => {
      if (erledigt) return;
      schluss();
      ok('fertig');
    };
    u.onerror = (e) => {
      if (erledigt) return;
      schluss();
      if (e.error === 'interrupted' || e.error === 'canceled') ok('abgebrochen');
      // Autoplay-Sperre vor der ersten Berührung: erwartbar. Danach ein echter Fehler.
      else if (e.error === 'not-allowed' && !entsperrt()) ok('abgebrochen');
      else fehler(new AudioFehler(`Die Sprachausgabe ist fehlgeschlagen (${e.error}).`));
    };
    signal.addEventListener('abort', abbruch, { once: true });
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
