/**
 * Live-Stimme „Piper offline“ (B18) — STUB, Eigentümer: Bau „Ton“.
 *
 * Soll: Piper (WASM/ONNX) im Browser, LAZY per dynamischem `import()` geladen, erst wenn Eltern
 * `liveStimme = 'piper'` wählen. Das Stimmmodell (de_DE-thorsten-high o. ä.) wird beim ersten Wählen
 * heruntergeladen und in Cache Storage gelegt — NICHT in den PWA-Precache (vite.config.ts), damit
 * App-Updates klein bleiben. Fortschritt für die Einstellungen über `laden(fortschritt)`.
 */
import { AudioFehler } from '../kern/vertrag';

/** Zustand des Piper-Modells auf diesem Gerät. */
export type PiperStand = 'fehlt' | 'laedt' | 'bereit';

/** Ist das Modell schon heruntergeladen und einsatzbereit? */
export async function piperStand(): Promise<PiperStand> {
  return 'fehlt';
}

/** Lädt Laufzeit und Stimmmodell (einmalig, danach offline). `fortschritt` bekommt 0..1. */
export async function piperLaden(_fortschritt?: (anteil: number) => void): Promise<void> {
  throw new AudioFehler('Die Offline-Stimme (Piper) ist in dieser Version noch nicht eingebaut.');
}

/** Vertont `text` offline. Liefert WAV/MP3 als Blob. */
export async function piperSprich(_text: string, _signal: AbortSignal): Promise<Blob> {
  throw new AudioFehler('Die Offline-Stimme (Piper) ist in dieser Version noch nicht eingebaut.');
}
