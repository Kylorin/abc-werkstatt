/**
 * Tier-Paket-Audio abspielen (Fundament-Hilfe für alle Modi).
 *
 * Alle Paket-Audios sind optional. Diese Hilfen liefern `undefined`, wenn das Feld fehlt — dann
 * entscheidet der Modus, was stattdessen passiert (Konzept: z. B. Name live, Schritt weglassen).
 * Varianten-Listen laufen über `AudioDienst.variante` (nie zweimal dieselbe hintereinander).
 *
 * Die Paket-Dateien kommen aus IndexedDB. Kommt während dieses Wartens eine andere Ausgabe oder
 * `stopp()` (z. B. Moduswechsel), startet der Ton nicht mehr und das Ergebnis ist `abgebrochen`
 * (`AudioDienst.gueltig`).
 */
import type { Ausgang, Kontext, Situation, SituationAudio, TierAudioListe, TierTreffer } from './vertrag';

type Dienste = Pick<Kontext, 'audio' | 'pakete'>;

/** Spielt eine Variante des Listen-Felds `feld` (z. B. 'freude', 'lautRuf', 'geraeusch') oder liefert undefined. */
export async function tierTon(d: Dienste, t: TierTreffer, feld: TierAudioListe): Promise<Ausgang | undefined> {
  const pfade = t.tier.audio?.[feld];
  if (!pfade?.length) return undefined;
  const gilt = d.audio.gueltig();
  const urls = await Promise.all(pfade.map((p) => d.pakete.audioUrl(t.paket.id, p)));
  if (!gilt()) return 'abgebrochen';
  return d.audio.variante(`${t.paket.id}/${t.tier.id}/${feld}`, urls);
}

/** Spielt die Einzeldatei `name` bzw. `kann` oder liefert undefined. */
export async function tierEinzel(d: Dienste, t: TierTreffer, feld: 'name' | 'kann'): Promise<Ausgang | undefined> {
  const pfad = t.tier.audio?.[feld];
  if (!pfad) return undefined;
  const gilt = d.audio.gueltig();
  const url = await d.pakete.audioUrl(t.paket.id, pfad);
  if (!gilt()) return 'abgebrochen';
  return d.audio.datei(url);
}

/** Spielt die i-te Datei eines Felds in fester Reihenfolge (`silben`, `raetsel`) oder liefert undefined. */
export async function tierNr(d: Dienste, t: TierTreffer, feld: 'silben' | 'raetsel', i: number): Promise<Ausgang | undefined> {
  const pfad = t.tier.audio?.[feld]?.[i];
  if (!pfad) return undefined;
  const gilt = d.audio.gueltig();
  const url = await d.pakete.audioUrl(t.paket.id, pfad);
  if (!gilt()) return 'abgebrochen';
  return d.audio.datei(url);
}

/** Tierlaut aus der Folge (`audio.geraeusch`) — gibt es meist (noch) nicht; dann undefined und still. */
export function tierGeraeusch(d: Dienste, t: TierTreffer): Promise<Ausgang | undefined> {
  return tierTon(d, t, 'geraeusch');
}

/** Problem- bzw. Lösungs-Erzählung einer Situation (F6) oder undefined. */
export async function situationTon(
  d: Dienste,
  t: TierTreffer,
  s: Situation,
  feld: keyof SituationAudio,
): Promise<Ausgang | undefined> {
  const pfade = s.audio?.[feld];
  if (!pfade?.length) return undefined;
  const gilt = d.audio.gueltig();
  const urls = await Promise.all(pfade.map((p) => d.pakete.audioUrl(t.paket.id, p)));
  if (!gilt()) return 'abgebrochen';
  return d.audio.variante(`${t.paket.id}/situation/${s.id}/${feld}`, urls);
}
