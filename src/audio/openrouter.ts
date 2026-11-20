/**
 * OpenRouter mit dem EIGENEN Schlüssel der Eltern (B18) — STUB, Eigentümer: Bau „Ton“.
 *
 * Soll:
 * - `openrouterSprich`: Live-Stimme für frei Geschriebenes über `openai/gpt-audio-mini`
 *   (POST https://openrouter.ai/api/v1/chat/completions, Audio-Ausgabe). Ergebnis landet über
 *   `live-cache.ts` in Cache Storage, damit jedes Wort nur einmal bezahlt wird.
 * - `openrouterTranskribiere`: Spracheingabe (Aufnahme → Text) für Eltern, nie als Richter.
 * Der Schlüssel bleibt im Gerät (Einstellungen), wird nie geloggt. Fehler (401/402/429/Netz) als
 * `AudioFehler` mit Elternmeldung. In der Abnahme werden diese Aufrufe per `page.route` gemockt.
 */
import { AudioFehler } from '../kern/vertrag';

/** Endpunkt (für das Mocken in der Abnahme: `**\/openrouter.ai/api/v1/**`). */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Modell für Live-Stimme und Transkription. */
export const OPENROUTER_MODELL = 'openai/gpt-audio-mini';

export async function openrouterSprich(_text: string, _schluessel: string, _signal: AbortSignal): Promise<Blob> {
  throw new AudioFehler('Die Live-Stimme über OpenRouter ist in dieser Version noch nicht eingebaut.');
}

export async function openrouterTranskribiere(_aufnahme: Blob, _schluessel: string): Promise<string> {
  throw new AudioFehler('Die Spracheingabe über OpenRouter ist in dieser Version noch nicht eingebaut.');
}
