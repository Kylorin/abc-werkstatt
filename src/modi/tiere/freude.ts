/**
 * Tier-Freude (Bau „schreiben") — gemeinsam für Tier-Modus und Freies Schreiben.
 *
 * Bewusste Ausnahme von der Montessori-Ruhe (Wunsch des Vaters): das Tier freut sich sichtbar —
 * hüpft mit Squash & Stretch, wackelt fröhlich, 5–8 kleine Herzen steigen auf, sanfter Glanz.
 * Fröhlich, aber kein Spielautomat: keine Punkte, keine Münzen, kein Blinken.
 * prefers-reduced-motion: kein Hüpfen, keine Herzen, nur der ruhige Glanz.
 */
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Kontext, TierTreffer } from '../../kern/vertrag';
import './freude.css';

export interface FreudeOptionen {
  bildUrl: string;
  /** Alternativtext, z. B. „der Igel". */
  alt: string;
}

/** Das freudige Tier als Element mit data-testid="tier-freude". */
export function erzeugeFreude(o: FreudeOptionen): HTMLElement {
  const bild = el('img', { klasse: 'freude__bild', attr: { src: o.bildUrl, alt: `${o.alt} freut sich`, draggable: 'false' } });
  const tier = el('div', { klasse: 'freude__tier' }, bild);
  const herzen = el('div', { klasse: 'freude__herzen', attr: { 'aria-hidden': 'true' } });
  const wurzel = el('div', { klasse: 'tier-freude', testid: 'tier-freude' }, el('div', { klasse: 'freude__glanz', attr: { 'aria-hidden': 'true' } }), tier, herzen);

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    animiere(tier, 'huepft');
    animiere(bild, 'freut-sich');
    const anzahl = 5 + Math.floor(Math.random() * 4); // 5–8
    for (let i = 0; i < anzahl; i++) {
      const groesse = 18 + Math.round(Math.random() * 14);
      const herz = el('span', { klasse: 'herz' }, icon('herz', { groesse }));
      const links = 18 + (64 * (i + 0.5)) / anzahl + (Math.random() * 8 - 4);
      herz.style.left = `${links}%`;
      herz.style.bottom = `${14 + Math.random() * 18}%`;
      herz.style.setProperty('--herz-x', `${Math.round(Math.random() * 60 - 30)}px`);
      herz.style.animationDelay = `${Math.round(i * 160 + Math.random() * 120)}ms`;
      herzen.append(herz);
    }
  }
  return wurzel;
}

function mitGrossemAnfang(text: string): string {
  const [erstes, ...rest] = Array.from(text);
  return erstes ? erstes.toLocaleUpperCase('de-DE') + rest.join('') : text;
}

/** Name des Tiers sprechen: Paket-Audio, sonst das Wort über den Audio-Dienst. */
export async function sprichTierName(ctx: Kontext, treffer: TierTreffer, wort: string): Promise<void> {
  const pfad = treffer.tier.audio?.name;
  if (pfad) await ctx.audio.datei(await ctx.pakete.audioUrl(treffer.paket.id, pfad));
  else await ctx.audio.wort(wort);
}

/**
 * Sprachausgabe der Freude: zuerst das Wort, dann die Freude (Paket-Audio, tier.freude oder
 * „Der Igel freut sich!"), danach – falls noch dieselbe Runde – was das Tier kann.
 * Fehler gehen an `melde`, nie still verloren.
 */
export async function sprichFreude(
  ctx: Kontext,
  treffer: TierTreffer,
  wort: string,
  aktuell: () => boolean,
  melde: (f: unknown) => void,
): Promise<void> {
  const { paket, tier } = treffer;
  try {
    await sprichTierName(ctx, treffer, wort);
    if (!aktuell()) return;
    const freuden = tier.audio?.freude ?? [];
    const wahl = freuden[Math.floor(Math.random() * freuden.length)];
    if (wahl) await ctx.audio.datei(await ctx.pakete.audioUrl(paket.id, wahl));
    else await ctx.audio.satz(tier.freude ?? `${mitGrossemAnfang(tier.artikel)} ${tier.name} freut sich!`);
    if (!aktuell() || !tier.kann) return;
    await ctx.audio.satz(tier.kann);
  } catch (f) {
    melde(f);
  }
}

/** Alternativtext/Anzeige „der Igel" (Artikel klein, Name wie im Paket). */
export function tierBezeichnung(treffer: TierTreffer): string {
  return `${treffer.tier.artikel} ${treffer.tier.name}`;
}

