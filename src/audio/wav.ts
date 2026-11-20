/**
 * WAV-Hilfen für live erzeugtes Audio (Piper liefert Float32, OpenRouter PCM16) und für die
 * Spracheingabe über OpenRouter (Aufnahme → 16 kHz mono WAV). Lautheit wird hier bewusst NICHT
 * normalisiert — das macht für den festen Bestand tools/vertonen.py.
 */

/** Mono-PCM16-Samples (Little Endian) → WAV-Blob. */
export function pcm16ZuWav(pcm: Uint8Array, abtastrate: number): Blob {
  const kopf = new ArrayBuffer(44);
  const d = new DataView(kopf);
  const text = (o: number, s: string): void => [...s].forEach((z, i) => d.setUint8(o + i, z.charCodeAt(0)));
  text(0, 'RIFF');
  d.setUint32(4, 36 + pcm.byteLength, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true); // PCM
  d.setUint16(22, 1, true); // mono
  d.setUint32(24, abtastrate, true);
  d.setUint32(28, abtastrate * 2, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  text(36, 'data');
  d.setUint32(40, pcm.byteLength, true);
  // Kopie in einen eigenen ArrayBuffer, damit der Blob nicht an einem geteilten Puffer hängt.
  return new Blob([kopf, pcm.slice()], { type: 'audio/wav' });
}

/** Float32-Samples (−1..1) → PCM16 Little Endian. */
export function floatZuPcm16(proben: Float32Array): Uint8Array {
  const aus = new DataView(new ArrayBuffer(proben.length * 2));
  for (let i = 0; i < proben.length; i++) {
    const v = Math.max(-1, Math.min(1, proben[i] ?? 0));
    aus.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(aus.buffer);
}

/** Base64 → Bytes. */
export function base64ZuBytes(b64: string): Uint8Array {
  const roh = atob(b64);
  const aus = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i++) aus[i] = roh.charCodeAt(i);
  return aus;
}

/** Bytes → Base64 (in Blöcken, damit große Aufnahmen den Stack nicht sprengen). */
export function bytesZuBase64(bytes: Uint8Array): string {
  let roh = '';
  const block = 0x8000;
  for (let i = 0; i < bytes.length; i += block) roh += String.fromCharCode(...bytes.subarray(i, i + block));
  return btoa(roh);
}

/**
 * Dekodiert eine Mikrofonaufnahme (webm/opus, mp4 …) und rechnet sie auf `zielRate` mono herunter.
 * Ergebnis: WAV-Bytes. Wirft, wenn der Browser das Format nicht dekodieren kann.
 */
export async function aufnahmeZuWav(aufnahme: Blob, zielRate = 16000): Promise<Uint8Array> {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx || typeof OfflineAudioContext === 'undefined') throw new Error('Dieses Gerät kann Aufnahmen nicht umwandeln.');
  const ctx = new Ctx();
  let puffer: AudioBuffer;
  try {
    puffer = await ctx.decodeAudioData(await aufnahme.arrayBuffer());
  } finally {
    void ctx.close();
  }
  const laenge = Math.max(1, Math.ceil(puffer.duration * zielRate));
  const offline = new OfflineAudioContext(1, laenge, zielRate);
  const quelle = offline.createBufferSource();
  quelle.buffer = puffer; // mehrere Kanäle mischt der Zielkontext (1 Kanal) selbst herunter
  quelle.connect(offline.destination);
  quelle.start();
  const mono = (await offline.startRendering()).getChannelData(0);
  const wav = pcm16ZuWav(floatZuPcm16(mono), zielRate);
  return new Uint8Array(await wav.arrayBuffer());
}
