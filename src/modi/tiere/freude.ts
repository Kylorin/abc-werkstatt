/**
 * Tier-Freude (Bau „schreiben“) — gemeinsam für Tier-Modus und Freies Schreiben.
 *
 * Bewusste Ausnahme von der Montessori-Ruhe (Wunsch des Vaters): das Tier freut sich sichtbar —
 * das runde Tierbild springt dreimal mit Squash & Stretch und wackelt fröhlich, ein Kranz Herzen
 * platzt aus ihm heraus, danach steigen große Herzen mit hellem Rand auf, dazu ein warmer Glanz.
 * Fröhlich, aber kein Spielautomat: keine Punkte, keine Münzen, kein Blinken.
 * prefers-reduced-motion: kein Hüpfen, keine Herzen, nur der ruhige Glanz.
 */
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Ausgang, Kontext, TierTreffer } from '../../kern/vertrag';
import './freude.css';

export interface FreudeOptionen {
  bildUrl: string;
  /** Alternativtext, z. B. „der Igel“. */
  alt: string;
}

/**
 * Rundes Tierbild („Medaillon"): Paketbilder sind oft Kacheln mit Rand oder Nachbarresten in den
 * Ecken — der Kreis zeigt nur die Mitte, und beim Hüpfen und Wackeln ragt keine Ecke aus dem Rahmen.
 */
export function erzeugeMedaillon(bildUrl: string, alt: string, opt: { klasse?: string; testid?: string } = {}): HTMLElement {
  const bild = el('img', { klasse: 'medaillon__bild', testid: opt.testid, attr: { src: bildUrl, alt, draggable: 'false' } });
  return el('span', { klasse: ['medaillon', opt.klasse ?? ''].filter(Boolean) }, bild);
}

/** Herz mit hellem Rand, damit es auch auf buntem Stoff sichtbar bleibt. */
function herz(groesse: number): HTMLElement {
  return el('span', { klasse: 'herz' }, icon('herz', { groesse, strich: 1.6 }));
}

/** Das freudige Tier als Element mit data-testid="tier-freude". */
export function erzeugeFreude(o: FreudeOptionen): HTMLElement {
  const medaillon = erzeugeMedaillon(o.bildUrl, `${o.alt} freut sich`);
  const tier = el('div', { klasse: 'freude__tier' }, medaillon);
  const herzen = el('div', { klasse: 'freude__herzen', attr: { 'aria-hidden': 'true' } });
  const wurzel = el('div', { klasse: 'tier-freude', testid: 'tier-freude' }, el('div', { klasse: 'freude__glanz', attr: { 'aria-hidden': 'true' } }), tier, herzen);

  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Das Tier selbst freut sich: Freudensprünge mit Squash & Stretch, dazwischen fröhliches Wackeln.
    animiere(tier, 'freude-springt');
    animiere(medaillon, 'freude-wackelt');

    // 1. Herzen platzen ringsum aus dem Tier heraus (ein kurzer Kranz) …
    const kranz = 8;
    for (let i = 0; i < kranz; i++) {
      const h = herz(26 + Math.round(Math.random() * 10));
      const winkel = (i / kranz) * Math.PI * 2 - Math.PI / 2 + (Math.random() * 0.4 - 0.2);
      const weite = 58 + Math.random() * 10; // % der Bühne vom Mittelpunkt
      h.classList.add('herz--platzt');
      h.style.setProperty('--herz-dx', `${Math.round(Math.cos(winkel) * weite)}cqw`);
      h.style.setProperty('--herz-dy', `${Math.round(Math.sin(winkel) * weite)}cqw`);
      h.style.animationDelay = `${120 + Math.round(Math.random() * 120)}ms`;
      herzen.append(h);
    }
    // 2. … danach steigen größere Herzen am Rand des Tiers auf.
    const steigend = 10;
    for (let i = 0; i < steigend; i++) {
      const h = herz(30 + Math.round(Math.random() * 18));
      const links = 4 + (92 * (i + 0.5)) / steigend + (Math.random() * 6 - 3);
      h.classList.add('herz--steigt');
      h.style.left = `${links}%`;
      h.style.bottom = `${10 + Math.random() * 30}%`;
      h.style.setProperty('--herz-x', `${Math.round(Math.random() * 80 - 40)}px`);
      h.style.animationDelay = `${700 + Math.round(i * 170 + Math.random() * 140)}ms`;
      herzen.append(h);
    }
  }
  return wurzel;
}

function mitGrossemAnfang(text: string): string {
  const [erstes, ...rest] = Array.from(text);
  return erstes ? erstes.toLocaleUpperCase('de-DE') + rest.join('') : text;
}

/** Name des Tiers sprechen: Paket-Audio, sonst das Wort über den Audio-Dienst. */
export async function sprichTierName(ctx: Kontext, treffer: TierTreffer, wort: string): Promise<Ausgang> {
  const pfad = treffer.tier.audio?.name;
  if (pfad) return ctx.audio.datei(await ctx.pakete.audioUrl(treffer.paket.id, pfad));
  return ctx.audio.wort(wort);
}

/**
 * Sprachausgabe der Freude: zuerst das Wort, dann die Freude (Paket-Audio, tier.freude oder
 * „Der Igel freut sich!“), danach, was das Tier kann.
 * Die Kette endet, sobald die Runde vorbei ist (`aktuell`) ODER ein Schritt abgebrochen wurde —
 * dann hat das Kind etwas Neues angetippt, und dessen Laut darf nicht übertönt werden.
 * Fehler gehen an `melde`, nie still verloren. Löst erst auf, wenn die Kette zu Ende ist.
 */
export async function sprichFreude(
  ctx: Kontext,
  treffer: TierTreffer,
  wort: string,
  aktuell: () => boolean,
  melde: (f: unknown) => void,
): Promise<void> {
  const { paket, tier } = treffer;
  const weiter = (a: Ausgang): boolean => a === 'fertig' && aktuell();
  try {
    if (!weiter(await sprichTierName(ctx, treffer, wort))) return;
    const freuden = tier.audio?.freude ?? [];
    const wahl = freuden[Math.floor(Math.random() * freuden.length)];
    const freude = wahl
      ? await ctx.audio.datei(await ctx.pakete.audioUrl(paket.id, wahl))
      : await ctx.audio.satz(tier.freude ?? `${mitGrossemAnfang(tier.artikel)} ${tier.name} freut sich!`);
    if (!weiter(freude)) return;
    // „kann“: Paket-Audio (gleiche Stimme wie Name und Freude), sonst der Satz über den Audio-Dienst.
    if (tier.audio?.kann) await ctx.audio.datei(await ctx.pakete.audioUrl(paket.id, tier.audio.kann));
    else if (tier.kann) await ctx.audio.satz(tier.kann);
  } catch (f) {
    melde(f);
  }
}

/** Alternativtext/Anzeige „der Igel“ (Artikel klein, Name wie im Paket). */
export function tierBezeichnung(treffer: TierTreffer): string {
  return `${treffer.tier.artikel} ${treffer.tier.name}`;
}

