/**
 * Tier-Wiese (F1): 3 große Medaillons zur freien Wahl. Gemeinsam für Tiere (F1) und Silben (F5).
 *
 * - Erster Tipp aufs Medaillon: das Tier bewegt sich (F4) und sagt seinen Namen.
 * - Zweiter Tipp auf dasselbe Tier oder der große Stift-Knopf daneben: los geht's.
 * - „andere Tiere“ (drei kleine Medaillons, ohne Würfel und ohne Animation) zeigt drei neue,
 *   „noch mal“ (Pfeil im Kreis um das letzte Tier) startet das letzte Tier direkt.
 * Testvertrag: `tier-wiese`, `tier-wahl-<id>` (data-bewegung), `tier-wahl-andere`,
 * `tier-wahl-nochmal`, `tier-schreiben`.
 */
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Ausgang, Kontext, TierTreffer } from '../../kern/vertrag';
import { bewegungVon } from '../../paket/bewegung';
import { bewege, erzeugeMedaillon, sprichTierName, tierBezeichnung } from './freude';
import { schreibwort } from '../../kern/alphabet';

export interface WiesenOptionen {
  ctx: Pick<Kontext, 'audio' | 'pakete'>;
  /** Die Tiere auf der Wiese (1–3). */
  tiere: readonly TierTreffer[];
  /** Das zuletzt gewählte Tier — dann gibt es „noch mal“. */
  letztes?: TierTreffer;
  /** Bild des Start-Knopfs (Standard: Stift). */
  startIcon?: 'frei' | 'silben';
  /** Erster Tipp: was das Tier sagt. Standard: sein Name. */
  sprich?(t: TierTreffer): Promise<Ausgang>;
  melde(f: unknown): void;
  beiWahl(t: TierTreffer): void;
  /** Ohne Handler kein Knopf „andere Tiere“. */
  beiAndere?(): void;
}

export interface Wiese {
  el: HTMLElement;
  zerstoere(): void;
}

const schluessel = (t: TierTreffer): string => `${t.paket.id}/${t.tier.id}`;

/** Baut die Wiese erst, wenn alle Bilder da sind (kein halber Zustand für das Kind). */
export async function erzeugeWiese(o: WiesenOptionen): Promise<Wiese> {
  const { ctx } = o;
  const [urls, letzteUrl] = await Promise.all([
    Promise.all(o.tiere.map((t) => ctx.pakete.bildUrl(t.paket.id, t.tier.bild))),
    o.letztes ? ctx.pakete.bildUrl(o.letztes.paket.id, o.letztes.tier.bild) : Promise.resolve(undefined),
  ]);
  let gewaehlt: TierTreffer | undefined;
  let lebt = true;

  const sprich = (t: TierTreffer): Promise<Ausgang> => (o.sprich ? o.sprich(t) : sprichTierName(ctx, t, schreibwort(t.tier.name)));

  const schreiben = el(
    'button',
    {
      klasse: 'knopf knopf--icon knopf--gross wiese__schreiben',
      testid: 'tier-schreiben',
      attr: { 'aria-label': 'Los geht’s', hidden: true },
      beiKlick: () => {
        if (gewaehlt && lebt) o.beiWahl(gewaehlt);
      },
    },
    icon(o.startIcon ?? 'frei', { groesse: 40, strich: 2 }),
  );

  const knoepfe = o.tiere.map((t, i) => {
    const bewegung = bewegungVon(t.tier);
    const medaillon = erzeugeMedaillon(urls[i] as string, tierBezeichnung(t), { klasse: 'wiese__medaillon' });
    const knopf = el(
      'button',
      {
        klasse: 'wiese__tier',
        testid: `tier-wahl-${t.tier.id}`,
        attr: { 'data-bewegung': bewegung, 'aria-label': tierBezeichnung(t), 'aria-pressed': 'false' },
        beiKlick: () => {
          if (!lebt) return;
          if (gewaehlt && schluessel(gewaehlt) === schluessel(t)) {
            o.beiWahl(t);
            return;
          }
          gewaehlt = t;
          for (const k of knoepfe) k.setAttribute('aria-pressed', String(k === knopf));
          schreiben.hidden = false;
          bewege(medaillon, bewegung);
          sprich(t).catch(o.melde);
        },
      },
      medaillon,
    );
    return knopf;
  });

  const unten = el('div', { klasse: 'wiese__knoepfe' });
  if (o.letztes && letzteUrl) {
    const letztes = o.letztes;
    unten.append(
      el(
        'button',
        {
          klasse: 'knopf knopf--icon knopf--gross wiese__nochmal',
          testid: 'tier-wahl-nochmal',
          attr: { 'aria-label': `Noch mal: ${tierBezeichnung(letztes)}` },
          beiKlick: () => {
            if (lebt) o.beiWahl(letztes);
          },
        },
        erzeugeMedaillon(letzteUrl, '', { klasse: 'wiese__nochmal-tier' }),
        el('span', { klasse: 'wiese__nochmal-pfeil', attr: { 'aria-hidden': 'true' } }, icon('nochmal', { groesse: 64, strich: 1.4 })),
      ),
    );
  }
  if (o.beiAndere) {
    const andere = o.beiAndere;
    unten.append(
      el(
        'button',
        {
          klasse: 'knopf knopf--icon knopf--gross wiese__andere',
          testid: 'tier-wahl-andere',
          attr: { 'aria-label': 'Andere Tiere' },
          beiKlick: () => {
            if (lebt) andere();
          },
        },
        icon('medaillons', { groesse: 34, strich: 1.8 }),
      ),
    );
  }

  const wurzel = el(
    'div',
    { klasse: 'wiese', testid: 'tier-wiese' },
    el('div', { klasse: ['wiese__tiere', `wiese__tiere--${knoepfe.length}`] }, ...knoepfe),
    el('div', { klasse: 'wiese__start' }, schreiben),
    unten,
  );
  return {
    el: wurzel,
    zerstoere() {
      lebt = false;
      wurzel.remove();
    },
  };
}
