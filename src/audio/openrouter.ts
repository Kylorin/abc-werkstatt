/**
 * OpenRouter mit dem EIGENEN Schlüssel der Eltern (B18).
 *
 * - `openrouterSprich`: Live-Stimme für frei Geschriebenes (6c) über `openai/gpt-audio-mini`,
 *   Antwort als Stream (SSE) mit PCM16 24 kHz mono → WAV-Blob. Den Cache (jedes Wort nur einmal
 *   bezahlen) macht der AudioDienst (live-cache.ts).
 * - `openrouterTranskribiere`: Spracheingabe für Eltern (B8) — Aufnahme → 16-kHz-WAV → ein
 *   Audio-fähiges Modell schreibt auf, was gesagt wurde. Nie als Richter über die Aussprache.
 *
 * Der Schlüssel bleibt auf dem Gerät (Einstellungen) und wird nie geloggt. Fehler (401/402/429/Netz)
 * kommen als `AudioFehler` mit einer Meldung für Eltern. In der Abnahme sind diese Aufrufe gemockt.
 */
import { AudioFehler } from '../kern/vertrag';
import { aufnahmeZuWav, base64ZuBytes, bytesZuBase64, pcm16ZuWav } from './wav';

/** Endpunkt (für das Mocken in der Abnahme: `**\/openrouter.ai/**`). */
export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
/** Modell für die Live-Stimme. */
export const OPENROUTER_MODELL = 'openai/gpt-audio-mini';
/** Feste Stimme der Live-Ausgabe (eine Stimme, kein Wechsel zwischen Läufen). */
export const OPENROUTER_STIMME = 'coral';
/** Audio-fähiges Modell für die Spracheingabe (Aufnahme → Text). */
export const TRANSKRIPTION_MODELL = 'google/gemini-2.5-flash';

/** gpt-audio liefert PCM16 mit dieser Abtastrate (mono). */
const PCM_RATE = 24000;

const VORLESEN =
  'Du bist die Vorlesestimme einer Schreib-App für ein kleines Kind. Lies den Text der Nutzerin bzw. ' +
  'des Nutzers genau so vor, wie er geschrieben ist: deutsch, ruhig, langsam und deutlich, Wort für Wort. ' +
  'Füge nichts hinzu, antworte nicht, erkläre nichts, frage nichts. Ist der Text kein echtes Wort, ' +
  'lies ihn trotzdem lautgetreu so, wie ein deutsches Kind ihn lesen würde. Buchstabiere nicht.';

const AUFSCHREIBEN =
  'Schreib genau auf, was in dieser Aufnahme auf Deutsch gesagt wird – nur die gesprochenen Wörter, ' +
  'kleingeschrieben, ohne Satzzeichen, ohne Anführungszeichen, ohne Erklärung. Ist nichts zu verstehen, ' +
  'antworte mit einem leeren Text.';

function kopf(schluessel: string): HeadersInit {
  return {
    Authorization: `Bearer ${schluessel}`,
    'Content-Type': 'application/json',
    'X-Title': 'ABC-Werkstatt',
  };
}

/** Elternmeldung zu einer HTTP-Antwort, die nicht ok war. */
async function httpFehler(r: Response, wofuer: string): Promise<AudioFehler> {
  let detail = '';
  try {
    const j = (await r.json()) as { error?: { message?: string } };
    detail = j.error?.message ?? '';
  } catch {
    detail = '';
  }
  const grund =
    r.status === 401 ? 'Der OpenRouter-Schlüssel wird nicht angenommen. Bitte in den Einstellungen prüfen.'
    : r.status === 402 ? 'Das Guthaben auf dem OpenRouter-Konto reicht nicht.'
    : r.status === 429 ? 'OpenRouter meldet zu viele Anfragen. Bitte etwas warten.'
    : `OpenRouter antwortet mit HTTP ${r.status}${detail ? ` (${detail.slice(0, 160)})` : ''}.`;
  return new AudioFehler(`${wofuer}: ${grund}`);
}

async function anfrage(body: unknown, schluessel: string, wofuer: string): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(OPENROUTER_URL, { method: 'POST', headers: kopf(schluessel), body: JSON.stringify(body) });
  } catch (f) {
    throw new AudioFehler(`${wofuer}: OpenRouter ist nicht erreichbar (${f instanceof Error ? f.message : String(f)}). Ohne Internet bitte eine andere Stimme wählen.`);
  }
  if (!r.ok) throw await httpFehler(r, wofuer);
  return r;
}

interface StreamStueck {
  error?: { message?: string };
  choices?: { delta?: { audio?: { data?: string } } }[];
}

/** Liest die SSE-Antwort und sammelt die base64-PCM16-Stücke. */
async function sammleAudio(r: Response): Promise<Uint8Array> {
  if (!r.body) throw new AudioFehler('Live-Stimme: OpenRouter hat keine Daten geschickt.');
  const leser = r.body.getReader();
  const dekoder = new TextDecoder();
  const teile: Uint8Array[] = [];
  let rest = '';
  let fertig = false;

  const zeile = (z: string): void => {
    const t = z.trim();
    if (!t.startsWith('data:')) return; // Kommentare („: OPENROUTER PROCESSING“) und leere Zeilen
    const daten = t.slice(5).trim();
    if (daten === '[DONE]') {
      fertig = true;
      return;
    }
    let j: StreamStueck;
    try {
      j = JSON.parse(daten) as StreamStueck;
    } catch {
      throw new AudioFehler('Live-Stimme: OpenRouter hat eine unlesbare Antwort geschickt.');
    }
    if (j.error) throw new AudioFehler(`Live-Stimme: OpenRouter meldet einen Fehler (${(j.error.message ?? '').slice(0, 160)}).`);
    const b64 = j.choices?.[0]?.delta?.audio?.data;
    if (b64) teile.push(base64ZuBytes(b64));
  };

  while (!fertig) {
    const { done, value } = await leser.read();
    if (value) rest += dekoder.decode(value, { stream: true });
    const zeilen = rest.split(/\r?\n/);
    rest = zeilen.pop() ?? '';
    for (const z of zeilen) zeile(z);
    if (done) {
      if (rest) zeile(rest);
      break;
    }
  }
  void leser.cancel().catch(() => undefined);

  const laenge = teile.reduce((s, t) => s + t.length, 0);
  if (laenge === 0) throw new AudioFehler('Live-Stimme: OpenRouter hat kein Audio geschickt.');
  const pcm = new Uint8Array(laenge - (laenge % 2));
  let o = 0;
  for (const t of teile) {
    const n = Math.min(t.length, pcm.length - o);
    pcm.set(t.subarray(0, n), o);
    o += n;
  }
  return pcm;
}

/**
 * Vertont `text` über OpenRouter (gpt-audio-mini). Läuft bewusst ohne Abbruch-Signal zu Ende:
 * Die Anfrage kostet so oder so — so landet das Ergebnis wenigstens im Cache.
 */
export async function openrouterSprich(text: string, schluessel: string): Promise<Blob> {
  const r = await anfrage({
    model: OPENROUTER_MODELL,
    modalities: ['text', 'audio'],
    audio: { voice: OPENROUTER_STIMME, format: 'pcm16' },
    stream: true,
    messages: [
      { role: 'system', content: VORLESEN },
      { role: 'user', content: text },
    ],
  }, schluessel, 'Live-Stimme');
  return pcm16ZuWav(await sammleAudio(r), PCM_RATE);
}

interface Antwort {
  error?: { message?: string };
  choices?: { message?: { content?: string | { type?: string; text?: string }[] | null } }[];
}

/** Spracheingabe: Aufnahme → Text (für Eltern, nie als Bewertung). */
export async function openrouterTranskribiere(aufnahme: Blob, schluessel: string): Promise<string> {
  let wav: Uint8Array;
  try {
    wav = await aufnahmeZuWav(aufnahme);
  } catch (f) {
    throw new AudioFehler(`Spracheingabe: Die Aufnahme ließ sich nicht umwandeln (${f instanceof Error ? f.message : String(f)}).`);
  }
  const r = await anfrage({
    model: TRANSKRIPTION_MODELL,
    temperature: 0,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: AUFSCHREIBEN },
        { type: 'input_audio', input_audio: { data: bytesZuBase64(wav), format: 'wav' } },
      ],
    }],
  }, schluessel, 'Spracheingabe');
  let j: Antwort;
  try {
    j = (await r.json()) as Antwort;
  } catch {
    throw new AudioFehler('Spracheingabe: OpenRouter hat eine unlesbare Antwort geschickt.');
  }
  if (j.error) throw new AudioFehler(`Spracheingabe: OpenRouter meldet einen Fehler (${(j.error.message ?? '').slice(0, 160)}).`);
  const inhalt = j.choices?.[0]?.message?.content;
  if (inhalt === undefined) throw new AudioFehler('Spracheingabe: OpenRouter hat keinen Text geschickt.');
  const text = typeof inhalt === 'string' ? inhalt : (inhalt ?? []).map((t) => t.text ?? '').join('');
  return text.trim();
}
