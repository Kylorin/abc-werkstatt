/**
 * Elternaufnahmen: Mikrofon (MediaRecorder) und Ablage in IndexedDB (eigener Store).
 * Eine Aufnahme hat Vorrang vor jeder anderen Quelle.
 */
import { createStore, del, get, set } from 'idb-keyval';
import { AudioFehler, type AudioSchluessel, type LaufendeAufnahme } from '../kern/vertrag';

const store = createStore('abc-werkstatt-aufnahmen', 'kv');

/** Gespeicherte Aufnahme (Blob + Zeitpunkt). */
interface GespeicherteAufnahme {
  blob: Blob;
  am: number;
}

/** Stabiler Schlüssel je Art und Text, z. B. „laut:m" oder „wort:igel". */
export function aufnahmeKey(s: AudioSchluessel): string {
  if (!s.text) throw new AudioFehler('Aufnahme ohne Buchstabe oder Wort.');
  return `${s.art}:${s.text}`;
}

/** Bevorzugte Formate: Chrome/Firefox webm/opus, Safari mp4. */
const FORMATE = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4'];

function waehleFormat(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== 'function') return undefined;
  return FORMATE.find((f) => MediaRecorder.isTypeSupported(f));
}

export class Aufnahmen {
  /** Blob-URLs je Schlüssel, damit Abspielen nicht jedes Mal neu liest. */
  private urls = new Map<string, string>();

  async starten(): Promise<LaufendeAufnahme> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new AudioFehler('Dieses Gerät kann hier nicht aufnehmen.');
    }
    let strom: MediaStream;
    try {
      strom = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (f) {
      const name = f instanceof DOMException ? f.name : '';
      throw new AudioFehler(
        name === 'NotAllowedError'
          ? 'Das Mikrofon ist nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.'
          : `Das Mikrofon ließ sich nicht öffnen (${name || String(f)}).`,
      );
    }
    const format = waehleFormat();
    const rec = format ? new MediaRecorder(strom, { mimeType: format }) : new MediaRecorder(strom);
    const teile: Blob[] = [];
    rec.addEventListener('dataavailable', (e) => {
      if (e.data.size > 0) teile.push(e.data);
    });
    const freigeben = (): void => strom.getTracks().forEach((t) => t.stop());
    rec.start();

    let beendet = false;
    return {
      stoppe: () =>
        new Promise<Blob>((ok, fehler) => {
          if (beendet) {
            fehler(new AudioFehler('Die Aufnahme ist schon beendet.'));
            return;
          }
          beendet = true;
          rec.addEventListener(
            'stop',
            () => {
              freigeben();
              const blob = new Blob(teile, { type: rec.mimeType || format || teile[0]?.type || '' });
              if (blob.size === 0) fehler(new AudioFehler('Die Aufnahme ist leer.'));
              else ok(blob);
            },
            { once: true },
          );
          rec.addEventListener('error', () => {
            freigeben();
            fehler(new AudioFehler('Die Aufnahme ist fehlgeschlagen.'));
          }, { once: true });
          rec.stop();
        }),
      abbrechen: () => {
        if (beendet) return;
        beendet = true;
        if (rec.state !== 'inactive') rec.stop();
        freigeben();
        teile.length = 0;
      },
    };
  }

  async speichern(s: AudioSchluessel, blob: Blob): Promise<void> {
    if (blob.size === 0) throw new AudioFehler('Die Aufnahme ist leer.');
    const key = aufnahmeKey(s);
    try {
      await set(key, { blob, am: Date.now() } satisfies GespeicherteAufnahme, store);
    } catch (f) {
      throw new AudioFehler(`Die Aufnahme ließ sich nicht speichern (${String(f)}).`);
    }
    this.vergiss(key);
  }

  async loeschen(s: AudioSchluessel): Promise<void> {
    const key = aufnahmeKey(s);
    await del(key, store);
    this.vergiss(key);
  }

  async hat(s: AudioSchluessel): Promise<boolean> {
    return (await get<GespeicherteAufnahme>(aufnahmeKey(s), store)) !== undefined;
  }

  /** Blob-URL der Aufnahme oder undefined. */
  async url(s: AudioSchluessel): Promise<string | undefined> {
    const key = aufnahmeKey(s);
    const vorhanden = this.urls.get(key);
    if (vorhanden) return vorhanden;
    const a = await get<GespeicherteAufnahme>(key, store);
    if (!a) return undefined;
    const url = URL.createObjectURL(a.blob);
    this.urls.set(key, url);
    return url;
  }

  private vergiss(key: string): void {
    const url = this.urls.get(key);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(key);
  }
}
