/**
 * Motor der Offline-Stimme (Piper) — wird NUR per dynamischem `import()` aus piper.ts geladen.
 *
 * Alles kommt aus Cache Storage (piper.ts hat es geprüft abgelegt), nichts aus dem Netz:
 * - ONNX Runtime Web (ESM-Bundle, per Blob-URL importiert; WASM als `env.wasm.wasmBinary`),
 * - der Piper-Phonemizer (Emscripten-Modul; WASM als `wasmBinary`, espeak-Daten als
 *   `getPreloadedPackage`),
 * - Stimmmodell + Konfiguration.
 * Ablauf je Text: Phonemizer → Phonem-Ids → VITS-Modell → Float32-PCM → WAV.
 */
import { AudioFehler } from '../kern/vertrag';
import { piperDateienAusCache } from './piper';
import { floatZuPcm16, pcm16ZuWav } from './wav';

/** Das Kind hört etwas langsamer besser zu (Faktor auf `length_scale`). */
const LANGSAMER = 1.15;

// ---- minimale Typen für den genutzten Teil von onnxruntime-web --------------

interface OrtTensor {
  data: unknown;
}
interface OrtTensorKonstruktor {
  new (typ: 'int64', daten: BigInt64Array, form: readonly number[]): OrtTensor;
  new (typ: 'float32', daten: Float32Array, form: readonly number[]): OrtTensor;
}
interface OrtSitzung {
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
}
interface Ort {
  env: { wasm: { wasmBinary?: ArrayBuffer | Uint8Array; numThreads?: number; proxy?: boolean } };
  Tensor: OrtTensorKonstruktor;
  InferenceSession: { create(modell: Uint8Array, optionen: { executionProviders: string[] }): Promise<OrtSitzung> };
}

// ---- Phonemizer (Emscripten) -------------------------------------------------

interface PhonemizerModul {
  callMain(args: string[]): void;
}
type PhonemizerFabrik = (modul: Record<string, unknown>) => Promise<PhonemizerModul>;

interface ModellInfo {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: { noise_scale: number; length_scale: number; noise_w: number };
  speaker_id_map?: Record<string, number>;
}

interface Bereit {
  ort: Ort;
  sitzung: OrtSitzung;
  info: ModellInfo;
  phonemizer: PhonemizerFabrik;
  phonemizerWasm: ArrayBuffer;
  phonemizerDaten: ArrayBuffer;
}

let bereit: Promise<Bereit> | undefined;

async function starte(): Promise<Bereit> {
  const d = await piperDateienAusCache();

  // ONNX Runtime: das ESM-Bundle hat keine relativen Importe und lässt sich als Blob-URL laden.
  const ortUrl = URL.createObjectURL(new Blob([d.ortJs], { type: 'text/javascript' }));
  let ort: Ort;
  try {
    ort = (await import(/* @vite-ignore */ ortUrl)) as Ort;
  } finally {
    URL.revokeObjectURL(ortUrl);
  }
  ort.env.wasm.wasmBinary = new Uint8Array(d.ortWasm);
  ort.env.wasm.numThreads = 1; // ohne Cross-Origin-Isolation gibt es ohnehin keine Threads
  ort.env.wasm.proxy = false;
  const sitzung = await ort.InferenceSession.create(new Uint8Array(d.modell), { executionProviders: ['wasm'] });

  const info = JSON.parse(new TextDecoder().decode(d.modellInfo)) as ModellInfo;
  if (!info.audio?.sample_rate || !info.espeak?.voice || !info.inference) {
    throw new AudioFehler('Offline-Stimme: Die Stimm-Konfiguration ist unvollständig.');
  }

  // Der Phonemizer ist ein klassisches Emscripten-Skript (UMD) mit `var createPiperPhonemize`.
  const quelltext = new TextDecoder().decode(d.phonemizerJs);
  const phonemizer = new Function(`${quelltext}\nreturn createPiperPhonemize;`)() as PhonemizerFabrik;
  if (typeof phonemizer !== 'function') throw new AudioFehler('Offline-Stimme: Der Phonemizer ließ sich nicht starten.');

  return { ort, sitzung, info, phonemizer, phonemizerWasm: d.phonemizerWasm, phonemizerDaten: d.phonemizerDaten };
}

/** Text → Phonem-Ids (ein frisches Emscripten-Modul je Aufruf, wie in piper-wasm vorgesehen). */
async function phoneme(b: Bereit, text: string): Promise<number[]> {
  let ids: number[] | undefined;
  const modul = await b.phonemizer({
    print: (zeile: string) => {
      if (ids) return;
      try {
        const j = JSON.parse(zeile) as { phoneme_ids?: number[] };
        if (Array.isArray(j.phoneme_ids)) ids = j.phoneme_ids;
      } catch {
        /* andere Ausgabezeilen gehören nicht zum Ergebnis */
      }
    },
    printErr: (zeile: string) => console.warn('Offline-Stimme (Phonemizer):', zeile),
    wasmBinary: b.phonemizerWasm,
    getPreloadedPackage: () => b.phonemizerDaten,
    locateFile: (pfad: string) => pfad,
  });
  modul.callMain(['-l', b.info.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  if (!ids?.length) throw new AudioFehler(`Offline-Stimme: Für „${text}“ kamen keine Laute heraus.`);
  return ids;
}

/** Vertont `text` (kurze Wörter und Kauderwelsch) zu einem WAV-Blob. */
export async function sprich(text: string): Promise<Blob> {
  const t = text.trim();
  if (!t) throw new AudioFehler('Offline-Stimme: Es gibt nichts vorzulesen.');
  bereit ??= starte().catch((f: unknown) => {
    bereit = undefined;
    throw f instanceof AudioFehler ? f : new AudioFehler(`Offline-Stimme ließ sich nicht starten (${f instanceof Error ? f.message : String(f)}).`);
  });
  const b = await bereit;
  const ids = await phoneme(b, t);
  const { noise_scale, length_scale, noise_w } = b.info.inference;
  const feeds: Record<string, OrtTensor> = {
    input: new b.ort.Tensor('int64', BigInt64Array.from(ids, (x) => BigInt(x)), [1, ids.length]),
    input_lengths: new b.ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new b.ort.Tensor('float32', Float32Array.from([noise_scale, length_scale * LANGSAMER, noise_w]), [3]),
  };
  if (Object.keys(b.info.speaker_id_map ?? {}).length) feeds['sid'] = new b.ort.Tensor('int64', BigInt64Array.from([BigInt(0)]), [1]);
  let ausgabe: Record<string, OrtTensor>;
  try {
    ausgabe = await b.sitzung.run(feeds);
  } catch (f) {
    throw new AudioFehler(`Offline-Stimme: Die Sprachsynthese ist fehlgeschlagen (${f instanceof Error ? f.message : String(f)}).`);
  }
  const pcm = ausgabe['output']?.data;
  if (!(pcm instanceof Float32Array) || pcm.length === 0) throw new AudioFehler('Offline-Stimme: Die Sprachsynthese lieferte kein Audio.');
  return pcm16ZuWav(floatZuPcm16(pcm), b.info.audio.sample_rate);
}
