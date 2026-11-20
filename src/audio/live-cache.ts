/**
 * Cache Storage für live vertontes Audio (Piper/OpenRouter): jedes Wort wird je Quelle nur einmal
 * erzeugt und klingt danach offline. Die Browserstimme wird nicht gecacht (sie liefert kein Audio).
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
  const r = await (await caches.open(CACHE)).match(url(quelle, text));
  return r ? r.blob() : undefined;
}

export async function inLiveCache(quelle: string, text: string, blob: Blob): Promise<void> {
  if (!verfuegbar()) return;
  await (await caches.open(CACHE)).put(url(quelle, text), new Response(blob, { headers: { 'Content-Type': blob.type || 'audio/mpeg' } }));
}
