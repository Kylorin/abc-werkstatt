/**
 * Dauerhafter Gerätespeicher (Fundament). Ohne `navigator.storage.persist()` gilt der Speicher
 * als „best effort": Chrome auf Android darf ihn bei Platzmangel ganz räumen — Tier-Paket,
 * Elternaufnahmen und Wörterbuch wären dann ohne Meldung weg.
 */

/** Fragt einmal um dauerhaften Speicher. true/false = Antwort des Browsers, undefined = API fehlt. */
export async function bitteUmDauerhaftenSpeicher(): Promise<boolean | undefined> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s?.persist || !s.persisted) return undefined;
  if (await s.persisted()) return true;
  return s.persist();
}

export interface SpeicherStand {
  /** true = dauerhaft, false = kann vom Browser geräumt werden, undefined = Gerät sagt es nicht. */
  dauerhaft?: boolean;
  /** Belegter Speicher in Byte, falls bekannt. */
  belegt?: number;
}

export async function speicherStand(): Promise<SpeicherStand> {
  const s = typeof navigator !== 'undefined' ? navigator.storage : undefined;
  if (!s) return {};
  const [dauerhaft, schaetzung] = await Promise.all([
    s.persisted ? s.persisted() : Promise.resolve(undefined),
    s.estimate ? s.estimate() : Promise.resolve(undefined),
  ]);
  return { dauerhaft, belegt: schaetzung?.usage };
}
