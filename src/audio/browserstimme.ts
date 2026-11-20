/**
 * Letzte Stufe: die Sprachausgabe des Browsers (speechSynthesis), de-DE.
 * Bevorzugt natürliche Stimmen („Natural", „Online", „Premium", „Enhanced").
 */
import { AudioFehler } from '../kern/vertrag';

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
 * Spricht `text`. Löst auf, wenn fertig oder abgebrochen (`signal`).
 * Wirft nur bei echten Fehlern, nicht bei Abbruch oder Autoplay-Sperre.
 */
export async function sprich(text: string, signal: AbortSignal): Promise<void> {
  if (!browserstimmeVerfuegbar()) throw new AudioFehler('Dieses Gerät hat keine Sprachausgabe.');
  const stimme = await besteStimme();
  if (signal.aborted) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 0.85;
  if (stimme) u.voice = stimme;
  await new Promise<void>((ok, fehler) => {
    const ende = (): void => {
      signal.removeEventListener('abort', abbruch);
      ok();
    };
    const abbruch = (): void => {
      speechSynthesis.cancel();
      ende();
    };
    u.onend = ende;
    u.onerror = (e) => {
      signal.removeEventListener('abort', abbruch);
      // interrupted/canceled = abgebrochen; not-allowed = Autoplay-Sperre vor der ersten Berührung
      if (e.error === 'interrupted' || e.error === 'canceled' || e.error === 'not-allowed') ok();
      else fehler(new AudioFehler(`Die Sprachausgabe ist fehlgeschlagen (${e.error}).`));
    };
    signal.addEventListener('abort', abbruch, { once: true });
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  });
}
