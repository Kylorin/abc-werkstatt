/**
 * Live-Vertonung über Azure Speech mit dem EIGENEN Schlüssel aus den Einstellungen
 * (nur im Gerät gespeichert). Ergebnisse landen in Cache Storage, damit jedes Wort
 * nur einmal bezahlt wird und danach offline klingt.
 */
import { AudioFehler } from '../kern/vertrag';
import { xml } from './ipa';

const CACHE = 'abc-werkstatt-tts-v1';
const FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

export interface AzureZugang {
  schluessel: string;
  region: string;
  stimme: string;
}

/** Cache-Schlüssel (synthetische URL) aus Stimme und SSML-Inhalt. */
function cacheUrl(stimme: string, body: string): string {
  return `https://tts.abc-werkstatt.invalid/${encodeURIComponent(stimme)}/${encodeURIComponent(body)}`;
}

function cacheVerfuegbar(): boolean {
  return typeof caches !== 'undefined';
}

/** Bereits live vertontes Audio aus dem Cache (Stimme + Inhalt), sonst undefined. */
export async function ausCache(stimme: string, body: string): Promise<Blob | undefined> {
  if (!cacheVerfuegbar()) return undefined;
  const c = await caches.open(CACHE);
  const r = await c.match(cacheUrl(stimme, body));
  return r ? r.blob() : undefined;
}

/** Vertont `body` (SSML innerhalb von <voice>) über Azure und legt es in den Cache. */
export async function vertone(z: AzureZugang, body: string): Promise<Blob> {
  const region = z.region.trim();
  if (!/^[a-z0-9-]+$/.test(region)) throw new AudioFehler('Die Azure-Region ist ungültig (z. B. „westeurope“).');
  const ssml =
    `<speak version="1.0" xml:lang="de-DE" xmlns="http://www.w3.org/2001/10/synthesis">` +
    `<voice name="${xml(z.stimme)}">${body}</voice></speak>`;
  let antwort: Response;
  try {
    antwort = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': z.schluessel.trim(),
        'Content-Type': 'application/ssml+xml; charset=utf-8',
        'X-Microsoft-OutputFormat': FORMAT,
      },
      body: new TextEncoder().encode(ssml),
    });
  } catch (f) {
    throw new AudioFehler(`Azure ist nicht erreichbar (${String(f)}).`);
  }
  if (!antwort.ok) {
    const hinweis =
      antwort.status === 401 || antwort.status === 403
        ? 'Schlüssel oder Region passen nicht'
        : antwort.status === 429
          ? 'zu viele Anfragen, bitte kurz warten'
          : 'Vertonung fehlgeschlagen';
    throw new AudioFehler(`Azure: ${hinweis} (HTTP ${antwort.status}).`);
  }
  const blob = await antwort.blob();
  if (blob.size === 0) throw new AudioFehler('Azure lieferte leeres Audio.');
  if (cacheVerfuegbar()) {
    const c = await caches.open(CACHE);
    await c.put(cacheUrl(z.stimme, body), new Response(blob, { headers: { 'Content-Type': 'audio/mpeg' } }));
  }
  return blob;
}
