/**
 * Live-Stimme „Offline-Stimme“ (Piper im Browser, B18/6c).
 *
 * Diese Datei ist klein und hängt am Start-Bundle: Dateiliste, Download mit Fortschritt, Stand.
 * Die eigentliche Sprachsynthese (ONNX Runtime + Piper-Phonemizer) steckt in `stimmen-motor.ts`
 * und wird erst per dynamischem `import()` geladen, wenn wirklich gesprochen wird.
 *
 * Laufzeit und Stimme kommen NICHT aus dem PWA-Precache (vite.config.ts), sondern werden beim
 * ersten Wählen einmal heruntergeladen (jsDelivr für die Laufzeit, Hugging Face für die Stimme
 * de_DE-thorsten-medium), per SHA-256 geprüft und in Cache Storage abgelegt. Danach klingt die
 * Stimme ohne Internet. Fehlt etwas, gibt es eine klare Meldung — es wird nie still nachgeladen,
 * während das Kind spielt.
 */
import { AudioFehler } from '../kern/vertrag';
import { bitteUmDauerhaftenSpeicher } from '../kern/speicher';

/** Zustand der Offline-Stimme auf diesem Gerät. */
export type PiperStand = 'fehlt' | 'laedt' | 'bereit';

/** Stimme im Browser (medium reicht hier; die feste Vorab-Vertonung nutzt high). */
export const PIPER_STIMME = 'de_DE-thorsten-medium';

const CACHE = 'abc-werkstatt-offline-stimme-v1';
const ORT = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist';
const PHONEMIZER = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build';
const STIMME = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/de/de_DE/thorsten/medium';

/** Rolle einer Datei im Motor. */
export type PiperRolle = 'ortJs' | 'ortWasm' | 'phonemizerJs' | 'phonemizerWasm' | 'phonemizerDaten' | 'modell' | 'modellInfo';

interface PiperDatei {
  rolle: PiperRolle;
  url: string;
  bytes: number;
  sha256: string;
}

/** Fest gepinnte Dateien mit Größe und Prüfsumme (keine „neueste Version“, kein stiller Wechsel). */
export const PIPER_DATEIEN: readonly PiperDatei[] = [
  { rolle: 'ortJs', url: `${ORT}/ort.wasm.bundle.min.mjs`, bytes: 48273, sha256: 'e53392ea5f0e654acf1866c16564b340661ed5d238f692c3c2bd40b940f924a2' },
  { rolle: 'ortWasm', url: `${ORT}/ort-wasm-simd-threaded.wasm`, bytes: 11210254, sha256: '71aef04959c5c1b6de461b6538e2058e306610034a85aad2742d0c7fd4533fe4' },
  { rolle: 'phonemizerJs', url: `${PHONEMIZER}/piper_phonemize.js`, bytes: 120714, sha256: 'fef0c2fc442d24fdef5c7c7cc37d5da2314407640fe11ab1bfe347c723dff19b' },
  { rolle: 'phonemizerWasm', url: `${PHONEMIZER}/piper_phonemize.wasm`, bytes: 635212, sha256: 'b777cd107a91d2bcc6a1ea46f2c26a662a7407394fe84589198aeaa83dd7a9d6' },
  { rolle: 'phonemizerDaten', url: `${PHONEMIZER}/piper_phonemize.data`, bytes: 18077249, sha256: '29f1025eb23a5b5c192cd14a6efbce4509402ff265405072ee6f7d1a09b78f8c' },
  { rolle: 'modell', url: `${STIMME}/${PIPER_STIMME}.onnx`, bytes: 63201294, sha256: '7e64762d8e5118bb578f2eea6207e1a35a8e0c30595010b666f983fc87bb7819' },
  { rolle: 'modellInfo', url: `${STIMME}/${PIPER_STIMME}.onnx.json`, bytes: 4819, sha256: '974adee790533adb273a1ac88f49027d2a1b8f0f2cf4905954a4791e79264e85' },
];

/** Gesamtgröße in MB (für den Elternhinweis). */
export const PIPER_MB = Math.round(PIPER_DATEIEN.reduce((s, d) => s + d.bytes, 0) / 1_000_000);

function cacheDa(): boolean {
  return typeof caches !== 'undefined';
}

// ---- Stand und Fortschritt ------------------------------------------------

let laufend: Promise<void> | undefined;
let anteil = 0;
const hoerer = new Set<(anteil: number | undefined) => void>();

/** Meldet den Fortschritt (0..1) eines laufenden Downloads; `undefined` = Download vorbei. */
export function piperFortschritt(fn: (anteil: number | undefined) => void): () => void {
  hoerer.add(fn);
  if (laufend) fn(anteil);
  return () => hoerer.delete(fn);
}

function melde(a: number | undefined): void {
  for (const fn of hoerer) fn(a);
}

/** Liegen alle Dateien im Cache? */
export async function piperStand(): Promise<PiperStand> {
  if (laufend) return 'laedt';
  if (!cacheDa()) return 'fehlt';
  const c = await caches.open(CACHE);
  for (const d of PIPER_DATEIEN) if (!(await c.match(d.url))) return 'fehlt';
  return 'bereit';
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  if (!crypto.subtle) throw new AudioFehler('Offline-Stimme: Dieses Gerät kann Downloads nicht prüfen (nur über https möglich).');
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...h].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Lädt eine Datei mit Fortschritt; prüft Größe und Prüfsumme. */
async function holeDatei(d: PiperDatei, geladen: (n: number) => void): Promise<ArrayBuffer> {
  let r: Response;
  try {
    r = await fetch(d.url, { cache: 'no-store' });
  } catch {
    throw new AudioFehler('Offline-Stimme: Kein Internet. Der einmalige Download braucht eine Verbindung.');
  }
  if (!r.ok) throw new AudioFehler(`Offline-Stimme: Download fehlgeschlagen (HTTP ${r.status} bei ${d.url.split('/').pop() ?? d.url}).`);
  const teile: Uint8Array[] = [];
  let n = 0;
  if (r.body) {
    const leser = r.body.getReader();
    for (;;) {
      const { done, value } = await leser.read();
      if (done) break;
      teile.push(value);
      n += value.length;
      geladen(n);
    }
  } else {
    const b = new Uint8Array(await r.arrayBuffer());
    teile.push(b);
    n = b.length;
    geladen(n);
  }
  const alles = new Uint8Array(n);
  let o = 0;
  for (const t of teile) {
    alles.set(t, o);
    o += t.length;
  }
  if (n !== d.bytes || (await sha256(alles.buffer)) !== d.sha256) {
    throw new AudioFehler(`Offline-Stimme: Die Datei ${d.url.split('/').pop() ?? ''} ist nicht die erwartete (Prüfsumme falsch). Nichts wurde gespeichert.`);
  }
  return alles.buffer;
}

/**
 * Lädt Laufzeit und Stimme einmalig herunter (danach offline). Läuft schon ein Download, wird
 * dessen Promise geliefert. `fortschritt` bekommt 0..1 (zusätzlich zu `piperFortschritt`).
 */
export function piperLaden(fortschritt?: (anteil: number) => void): Promise<void> {
  if (laufend) {
    if (fortschritt) {
      const ab = piperFortschritt((a) => {
        if (a !== undefined) fortschritt(a);
      });
      void laufend.finally(ab).catch(() => undefined);
    }
    return laufend;
  }
  if (!cacheDa()) return Promise.reject(new AudioFehler('Offline-Stimme: Dieses Gerät hat keinen Cache-Speicher für Downloads.'));
  const gesamt = PIPER_DATEIEN.reduce((s, d) => s + d.bytes, 0);
  anteil = 0;
  laufend = (async () => {
    const c = await caches.open(CACHE);
    const fertig = new Map<string, number>();
    const zaehle = (url: string, n: number): void => {
      fertig.set(url, n);
      anteil = Math.min(1, [...fertig.values()].reduce((s, x) => s + x, 0) / gesamt);
      fortschritt?.(anteil);
      melde(anteil);
    };
    // Nacheinander: schont schwache Verbindungen, Fortschritt bleibt verständlich.
    for (const d of PIPER_DATEIEN) {
      if (await c.match(d.url)) {
        zaehle(d.url, d.bytes);
        continue;
      }
      const daten = await holeDatei(d, (n) => zaehle(d.url, n));
      try {
        await c.put(d.url, new Response(daten, { headers: { 'Content-Type': 'application/octet-stream' } }));
      } catch (f) {
        throw new AudioFehler(`Offline-Stimme: Kein Platz zum Speichern (${f instanceof Error ? f.message : String(f)}).`);
      }
    }
    bitteUmDauerhaftenSpeicher().catch((f: unknown) => console.error('Dauerhafter Speicher nicht anfragbar', f));
  })().finally(() => {
    laufend = undefined;
    melde(undefined);
  });
  return laufend;
}

/** Löscht Laufzeit und Stimme von diesem Gerät. */
export async function piperEntfernen(): Promise<void> {
  if (laufend) throw new AudioFehler('Offline-Stimme: Bitte warten, bis der Download fertig ist.');
  motor = undefined;
  if (cacheDa()) await caches.delete(CACHE);
}

/** Liest alle Dateien aus dem Cache (für den Motor). Fehlt eine: AudioFehler. */
export async function piperDateienAusCache(): Promise<Record<PiperRolle, ArrayBuffer>> {
  if (!cacheDa()) throw new AudioFehler('Offline-Stimme: Dieses Gerät hat keinen Cache-Speicher.');
  const c = await caches.open(CACHE);
  const aus = {} as Record<PiperRolle, ArrayBuffer>;
  for (const d of PIPER_DATEIEN) {
    const r = await c.match(d.url);
    if (!r) throw new AudioFehler('Die Offline-Stimme ist auf diesem Gerät noch nicht geladen. Bitte in den Einstellungen unter „Stimme“ herunterladen.');
    aus[d.rolle] = await r.arrayBuffer();
  }
  return aus;
}

// ---- Sprechen ---------------------------------------------------------------

type Motor = typeof import('./stimmen-motor');
let motor: Promise<Motor> | undefined;

/** Vertont `text` offline. Liefert WAV als Blob. Ohne geladene Stimme: AudioFehler. */
export async function piperSprich(text: string): Promise<Blob> {
  if (laufend) throw new AudioFehler('Die Offline-Stimme wird gerade noch heruntergeladen.');
  if ((await piperStand()) !== 'bereit') {
    throw new AudioFehler('Die Offline-Stimme ist auf diesem Gerät noch nicht geladen. Bitte in den Einstellungen unter „Stimme“ herunterladen.');
  }
  motor ??= import('./stimmen-motor').catch((f: unknown) => {
    motor = undefined;
    throw new AudioFehler(`Offline-Stimme: Der Programmteil ließ sich nicht laden (${f instanceof Error ? f.message : String(f)}).`);
  });
  return (await motor).sprich(text);
}
