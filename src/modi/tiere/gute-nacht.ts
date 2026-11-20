/**
 * Gute Nacht (B9): nach `rundenBisGuteNacht` gelungenen Runden gähnen die Tiere DIESER Sitzung,
 * kuscheln sich auf eine Patchwork-Decke, und das Licht wird warm und gedimmt. Kein Zähler, nichts
 * wird gesammelt. Ein Tipp weckt sie wieder — aufhören fällt aber leicht.
 * Gemeinsam für Tiere (F1), Decke (F3) und Geschichten (F6).
 */
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { tierTon } from '../../kern/tierton';
import type { Ausgang, KettenSchritt, Kontext, TierTreffer } from '../../kern/vertrag';
import { erzeugeMedaillon, SPRECH_PAUSE_MS, tierBezeichnung } from './freude';
import './gute-nacht.css';

/** Höchstens so viele Tiere liegen auf der Decke (die zuletzt dagewesenen). */
const MAX_AUF_DECKE = 5;

export interface GuteNachtOptionen {
  ctx: Pick<Kontext, 'audio' | 'pakete'>;
  /** Die Tiere dieser Sitzung (Reihenfolge des Auftritts, Doppelte werden zusammengelegt). */
  tiere: readonly TierTreffer[];
  melde(f: unknown): void;
  /** Tipp: Die Tiere wachen auf. */
  beiWecken(): void;
}

export interface GuteNacht {
  el: HTMLElement;
  zerstoere(): void;
}

/** Gute-Nacht-Bild mit data-testid="gute-nacht". Spricht `gutenacht.satz`, dann gähnt ein Tier (Paket-Audio, falls da). */
export function erzeugeGuteNacht(o: GuteNachtOptionen): GuteNacht {
  const { ctx } = o;
  const gesehen = new Set<string>();
  const tiere = [...o.tiere].reverse().filter((t) => {
    const k = `${t.paket.id}/${t.tier.id}`;
    if (gesehen.has(k)) return false;
    gesehen.add(k);
    return true;
  }).slice(0, MAX_AUF_DECKE).reverse();

  const schlaefer = el('div', { klasse: 'gute-nacht__tiere' });
  let lebt = true;
  void Promise.all(tiere.map((t) => ctx.pakete.bildUrl(t.paket.id, t.tier.bild)))
    .then((urls) => {
      if (!lebt) return;
      schlaefer.replaceChildren(
        ...urls.map((url, i) => {
          const t = tiere[i] as TierTreffer;
          const m = erzeugeMedaillon(url, `${tierBezeichnung(t)} schläft`, { klasse: 'gute-nacht__tier' });
          m.style.setProperty('--i', String(i));
          return m;
        }),
      );
    })
    .catch(o.melde);

  const wurzel = el(
    'button',
    {
      klasse: 'gute-nacht',
      testid: 'gute-nacht',
      attr: { 'aria-label': 'Die Tiere schlafen. Antippen weckt sie.' },
      beiKlick: () => {
        if (!lebt) return;
        ctx.audio.fest('gutenacht.wecken').catch(o.melde);
        o.beiWecken();
      },
    },
    el('span', { klasse: 'gute-nacht__mond', attr: { 'aria-hidden': 'true' } }, icon('mond', { groesse: 56, strich: 1.6 })),
    el('span', { klasse: 'gute-nacht__decke', attr: { 'aria-hidden': 'true' } }),
    schlaefer,
  );

  // „Die Tiere werden müde …“ → Pause → ein Tier gähnt (wenn das Paket es vertont hat).
  const gaehner = tiere.find((t) => t.tier.audio?.gaehnen?.length);
  const schritte: KettenSchritt[] = [() => ctx.audio.fest('gutenacht.satz')];
  if (gaehner) schritte.push(async (): Promise<Ausgang> => (await tierTon(ctx, gaehner, 'gaehnen')) ?? 'fertig');
  ctx.audio.kette(schritte, SPRECH_PAUSE_MS).catch(o.melde);

  return {
    el: wurzel,
    zerstoere() {
      lebt = false;
      wurzel.remove();
    },
  };
}
