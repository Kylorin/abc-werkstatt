/**
 * Cache Storage für live vertontes Audio (Piper/OpenRouter): jedes Wort wird je Quelle nur einmal
 * erzeugt und klingt danach offline. Die Browserstimme wird nicht gecacht (sie liefert kein Audio).
 *
 * Der Cache ist nur eine Ersparnis: Wirft Cache Storage (voller Speicher, blockierter Speicher im
 * privaten Fenster …), wird das im Log gemeldet und ohne Cache weitergemacht — ein fertig erzeugtes
 * (womöglich bezahltes) Audio wird deshalb nie verworfen.
 */
const CACHE = 'abc-werkstatt-live-v1';

function verfuegbar(): boolean {
  return typeof caches !== 'undefined';
}

/** Synthetische Cache-URL aus Quelle und Text. */
function url(quelle: string, text: string): string {
  return `https://live.abc-werkstatt.invalid/${encodeURIComponent(quelle)}/${encodeURIComponent(text)}`;
}

export async function ausLiveCache(quelle: string, text: string): Promise<Blob | undefined> {
  if (!verfuegbar()) return undefined;
  try {
    const r = await (await caches.open(CACHE)).match(url(quelle, text));
    return r ? await r.blob() : undefined;
  } catch (f) {
    console.error('Live-Cache nicht lesbar — es wird neu erzeugt.', f);
    return undefined;
  }
}

export async function inLiveCache(quelle: string, text: string, blob: Blob): Promise<void> {
  if (!verfuegbar()) return;
  try {
    await (await caches.open(CACHE)).put(url(quelle, text), new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }));
  } catch (f) {
    console.error('Live-Cache nicht beschreibbar — das Audio klingt trotzdem, wird aber beim nächsten Mal neu erzeugt.', f);
  }
}
