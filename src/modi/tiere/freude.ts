/**
 * Tier-Freude (Bau „tiere“) — gemeinsam für Tier-Modus, Freies Schreiben, Gucker, Decke, Geschichten.
 *
 * Bewusste Ausnahme von der Montessori-Ruhe (Wunsch des Vaters): das Tier freut sich sichtbar —
 * in SEINER Bewegung (F4: hüpft, fliegt, kriecht, schwimmt, rollt, klettert, watschelt,
 * schlängelt, stampft, tanzt), ein Kranz Herzen platzt aus ihm heraus, danach steigen Herzen auf,
 * dazu ein warmer Glanz. Fröhlich, aber kein Spielautomat: keine Punkte, keine Münzen, kein Blinken.
 * prefers-reduced-motion: keine Bewegung, keine Herzen, nur der ruhige Glanz.
 *
 * Sprechen (B10/B11): Name (beim selben Tier wieder: der „kann“-Satz) → Pause → Freude-Variante,
 * nie dieselbe Variante zweimal hintereinander, zusammen höchstens ≈ 8 s, jederzeit abbrechbar.
 */
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { tierEinzel, tierGeraeusch, tierTon } from '../../kern/tierton';
import type { Ausgang, Bewegung, KettenSchritt, Kontext, Tier, TierTreffer } from '../../kern/vertrag';
import { bewegungVon } from '../../paket/bewegung';
import './freude.css';

/** Pause zwischen zwei Sätzen einer Kette zum Nachsprechen (B11: 1–1,5 s). */
export const SPRECH_PAUSE_MS = 1200;

type TonDienste = Pick<Kontext, 'audio' | 'pakete'>;

export interface FreudeOptionen {
  bildUrl: string;
  /** Alternativtext, z. B. „der Igel“. */
  alt: string;
  /** Bewegung (F4). Ohne: aus `tier` abgeleitet, sonst `huepft`. */
  bewegung?: Bewegung;
  /** Das Tier, dessen Bewegung gilt, wenn `bewegung` fehlt. */
  tier?: Pick<Tier, 'name' | 'bewegung'>;
}

export const ruhigeDarstellung = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Rundes Tierbild („Medaillon"): Paketbilder sind oft Kacheln mit Rand oder Nachbarresten in den
 * Ecken — der Kreis zeigt nur die Mitte, und beim Hüpfen und Wackeln ragt keine Ecke aus dem Rahmen.
 */
export function erzeugeMedaillon(
  bildUrl: string,
  alt: string,
  opt: { klasse?: string; testid?: string; bewegung?: Bewegung } = {},
): HTMLElement {
  const bild = el('img', { klasse: 'medaillon__bild', testid: opt.testid, attr: { src: bildUrl, alt, draggable: 'false' } });
  return el('span', { klasse: ['medaillon', opt.klasse ?? ''].filter(Boolean), attr: { 'data-bewegung': opt.bewegung } }, bild);
}

/** Spielt die Bewegung einmal an `ziel` ab (F4). In der ruhigen Darstellung passiert nichts. */
export function bewege(ziel: HTMLElement, bewegung: Bewegung): void {
  if (ruhigeDarstellung()) return;
  animiere(ziel, `bewegt--${bewegung}`);
}

/** Herz mit hellem Rand, damit es auch auf buntem Stoff sichtbar bleibt. */
function herz(groesse: number): HTMLElement {
  return el('span', { klasse: 'herz' }, icon('herz', { groesse, strich: 1.6 }));
}

/** Das freudige Tier als Element mit data-testid="tier-freude" und data-bewegung. */
export function erzeugeFreude(o: FreudeOptionen): HTMLElement {
  const bewegung = o.bewegung ?? (o.tier ? bewegungVon(o.tier) : 'huepft');
  const medaillon = erzeugeMedaillon(o.bildUrl, `${o.alt} freut sich`);
  const tier = el('div', { klasse: 'freude__tier' }, medaillon);
  const herzen = el('div', { klasse: 'freude__herzen', attr: { 'aria-hidden': 'true' } });
  const wurzel = el(
    'div',
    { klasse: 'tier-freude', testid: 'tier-freude', attr: { 'data-bewegung': bewegung } },
    el('div', { klasse: 'freude__glanz', attr: { 'aria-hidden': 'true' } }),
    tier,
    herzen,
  );

  if (!ruhigeDarstellung()) {
    // Das Tier selbst freut sich in seiner Bewegung; hüpfende Tiere wackeln dazu fröhlich.
    animiere(tier, `bewegt--${bewegung}`);
    if (bewegung === 'huepft' || bewegung === 'watschelt') animiere(medaillon, 'freude-wackelt');
    if (bewegung === 'stampft') animiere(wurzel, 'buehne-wackelt');

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

/** Alternativtext/Anzeige „der Igel“ (Artikel klein, Name wie im Paket). */
export function tierBezeichnung(treffer: TierTreffer): string {
  return `${treffer.tier.artikel} ${treffer.tier.name}`;
}

// ---------------------------------------------------------------------------
// Sprechen
// ---------------------------------------------------------------------------

/** Name des Tiers sprechen: Paket-Audio, sonst das Wort über den Audio-Dienst (vorab vertont oder live). */
export async function sprichTierName(ctx: TonDienste, treffer: TierTreffer, wort: string): Promise<Ausgang> {
  return (await tierEinzel(ctx, treffer, 'name')) ?? ctx.audio.wort(wort);
}

/** true, wenn das Tier einen „kann“-Satz hat (Audio oder Text). */
export function hatKann(tier: Tier): boolean {
  return Boolean(tier.audio?.kann || tier.kann);
}

/** „kann“-Satz: Paket-Audio (gleiche Stimme wie Name und Freude), sonst der Text über die Live-Stimme. */
export async function sprichKann(ctx: TonDienste, treffer: TierTreffer): Promise<Ausgang> {
  const a = await tierEinzel(ctx, treffer, 'kann');
  if (a) return a;
  if (treffer.tier.kann) return ctx.audio.satz(treffer.tier.kann);
  return 'fertig';
}

/**
 * Freude-Satz: Paket-Variante (nie zweimal dieselbe hintereinander), sonst der Freude-Text des
 * Pakets über die Rückfallstimme, sonst der feste Satz `freude.allgemein`.
 */
export async function sprichFreudeSatz(ctx: TonDienste, treffer: TierTreffer): Promise<Ausgang> {
  const a = await tierTon(ctx, treffer, 'freude');
  if (a) return a;
  if (treffer.tier.freude) return ctx.audio.satz(treffer.tier.freude);
  return ctx.audio.fest('freude.allgemein');
}

/** Geräusch zur Bewegung: erst der Tierlaut aus dem Paket (falls da), sonst `geraeusch.bewegung.<art>` (falls vertont). */
export async function sprichBewegungsGeraeusch(ctx: TonDienste, treffer: TierTreffer): Promise<Ausgang> {
  const tierlaut = await tierGeraeusch(ctx, treffer);
  if (tierlaut) return tierlaut;
  const schluessel = `geraeusch.bewegung.${bewegungVon(treffer.tier)}`;
  const gilt = ctx.audio.gueltig();
  if (await ctx.audio.hatFest(schluessel)) return gilt() ? ctx.audio.fest(schluessel) : 'abgebrochen';
  return 'fertig';
}

/** Schritte nur ausführen, solange `aktuell()` gilt — sonst bricht die Kette sofort ab. */
function solange(aktuell: () => boolean, schritte: readonly KettenSchritt[]): KettenSchritt[] {
  return schritte.map((s) => () => (aktuell() ? s() : Promise.resolve<Ausgang>('abgebrochen')));
}

export interface FreudeSprechOptionen {
  /** Dasselbe Tier wie beim letzten Mal: die Freude beginnt mit dem „kann“-Satz statt dem Namen (B10). */
  wiederholt?: boolean;
  /** Zuerst diese Schritte (z. B. „Du hast den Hasen geschrieben!“ statt des Namens). */
  anfang?: KettenSchritt[];
}

/**
 * Sprachausgabe der Freude: Name (bzw. `kann` oder `anfang`) → Pause → Freude.
 * Die Kette endet, sobald die Runde vorbei ist (`aktuell`) ODER ein Schritt abgebrochen wurde —
 * dann hat das Kind etwas Neues angetippt, und dessen Laut darf nicht übertönt werden.
 * Fehler gehen an `melde`, nie still verloren. Löst erst auf, wenn die Kette zu Ende ist.
 */
export async function sprichFreude(
  ctx: TonDienste,
  treffer: TierTreffer,
  wort: string,
  aktuell: () => boolean,
  melde: (f: unknown) => void,
  opt: FreudeSprechOptionen = {},
): Promise<void> {
  const erster: KettenSchritt[] =
    opt.anfang ?? [opt.wiederholt && hatKann(treffer.tier) ? () => sprichKann(ctx, treffer) : () => sprichTierName(ctx, treffer, wort)];
  try {
    if (!aktuell()) return;
    await ctx.audio.kette(solange(aktuell, [...erster, () => sprichFreudeSatz(ctx, treffer)]), SPRECH_PAUSE_MS);
  } catch (f) {
    melde(f);
  }
}

/**
 * Tipp aufs sitzende Tier nach der Freude (F1 Punkt 5): jeder Tipp etwas Neues —
 * 1. Name, 2. „kann“-Satz, 3. Bewegung mit Geräusch, dann eine Freude-Variante. Jede Ausgabe
 * bricht beim nächsten Tipp ab (der Audio-Dienst spielt immer nur eine Quelle).
 */
export function tippAufsTier(
  ctx: TonDienste,
  treffer: TierTreffer,
  wort: string,
  nr: number,
  ziel: HTMLElement,
  melde: (f: unknown) => void,
): void {
  const schritt = nr % 3;
  let p: Promise<unknown>;
  if (schritt === 0) p = sprichTierName(ctx, treffer, wort);
  else if (schritt === 1) p = hatKann(treffer.tier) ? sprichKann(ctx, treffer) : sprichTierName(ctx, treffer, wort);
  else {
    bewege(ziel, bewegungVon(treffer.tier));
    p = ctx.audio.kette([() => sprichBewegungsGeraeusch(ctx, treffer), () => sprichFreudeSatz(ctx, treffer)], 300);
  }
  p.catch(melde);
}
