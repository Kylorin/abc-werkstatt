/**
 * Gute Nacht (B9): nach `rundenBisGuteNacht` gelungenen Runden gähnen die Tiere DIESER Sitzung,
 * kuscheln sich auf eine Patchwork-Decke, und das Licht wird warm und gedimmt. Kein Zähler, nichts
 * wird gesammelt. Ein Tipp weckt sie wieder — aufhören fällt aber leicht.
 * Gemeinsam für Tiere (F1), Decke (F3) und Geschichten (F6).
 *
 * - Alle Tiere der Sitzung (höchstens MAX_AUF_DECKE, Doppelte zusammengelegt) liegen groß und
 *   nebeneinander, nie übereinander, auf der Decke: hochkant in zwei Reihen ab drei Tieren,
 *   quer in einer Reihe. Die Größe richtet sich nach Platz und Anzahl (CSS-Variablen).
 * - Unten pulsiert eine Sonne: „hier tippen weckt“. Beim Wecken geht die Sonne auf, die Tiere
 *   hüpfen, `gutenacht.wecken` klingt — und erst danach (spätestens nach WECKEN_SPAETESTENS_MS,
 *   falls der Ton hängt) geht es weiter. So schneidet der nächste Bildschirm den Weckton nicht ab.
 */
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { tierTon } from '../../kern/tierton';
import type { Ausgang, KettenSchritt, Kontext, TierTreffer } from '../../kern/vertrag';
import { erzeugeDeckenStoff } from '../decke/stoff';
import { bewege, erzeugeMedaillon, SPRECH_PAUSE_MS, tierBezeichnung } from './freude';
import './gute-nacht.css';

/** Höchstens so viele Tiere liegen auf der Decke (die zuletzt dagewesenen). */
const MAX_AUF_DECKE = 5;
/** Spätestens dann geht es nach dem Wecken weiter, auch wenn der Weckton hängt oder nie startet. */
export const WECKEN_SPAETESTENS_MS = 1800;
/** Mindestens so lange ist das Aufwachen zu sehen (Sonne geht auf, Tiere hüpfen). */
const WECKEN_MINDESTENS_MS = 700;

/** Sonne als Wecken-Hinweis (eigenes SVG: Kreis mit Strahlen, die sich drehen). */
const SONNE_SVG =
  '<svg viewBox="0 0 64 64" width="56" height="56" focusable="false" aria-hidden="true">' +
  '<g class="gute-nacht__strahlen">' +
  Array.from({ length: 8 }, (_, i) => `<path d="M32 4.5v8" transform="rotate(${i * 45} 32 32)"/>`).join('') +
  '</g><circle cx="32" cy="32" r="12.5"/></svg>';

/** Spalten hochkant: 1–2 Tiere nebeneinander, 3–4 als 2 × 2 (3: zwei oben, eins mittig), 5 als 3 + 2. */
function spaltenHochkant(n: number): number {
  return n <= 2 ? Math.max(1, n) : n <= 4 ? 2 : 3;
}

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

  const n = Math.max(1, tiere.length);
  const spalten = spaltenHochkant(n);
  const schlaefer = el('div', { klasse: 'gute-nacht__tiere', testid: 'gute-nacht-tiere' });
  const bett = el('div', { klasse: 'gute-nacht__bett' }, erzeugeDeckenStoff({ form: 'flach', klasse: 'gute-nacht__decke' }), schlaefer);
  bett.style.setProperty('--n', String(n));
  bett.style.setProperty('--spalten-hoch', String(spalten));
  bett.style.setProperty('--reihen-hoch', String(Math.ceil(n / spalten)));

  let lebt = true;
  let geweckt = false;
  let timer: number | undefined;
  const medaillons: HTMLElement[] = [];
  void Promise.all(tiere.map((t) => ctx.pakete.bildUrl(t.paket.id, t.tier.bild)))
    .then((urls) => {
      if (!lebt) return;
      schlaefer.replaceChildren(
        ...urls.map((url, i) => {
          const t = tiere[i] as TierTreffer;
          const m = erzeugeMedaillon(url, `${tierBezeichnung(t)} schläft`, { klasse: 'gute-nacht__tier' });
          m.style.setProperty('--i', String(i));
          medaillons.push(m);
          return m;
        }),
      );
    })
    .catch(o.melde);

  const sonne = el('span', { klasse: 'gute-nacht__sonne', testid: 'gute-nacht-wecken', attr: { 'aria-hidden': 'true' } });
  sonne.innerHTML = SONNE_SVG;

  /** Weckton, Sonne geht auf, Tiere hüpfen — dann weiter (nach dem Ton bzw. spätestens nach der Frist). */
  function wecke(): void {
    if (!lebt || geweckt) return;
    geweckt = true;
    wurzel.classList.add('gute-nacht--wach');
    wurzel.setAttribute('aria-label', 'Die Tiere wachen auf.');
    for (const m of medaillons) bewege(m, 'huepft');
    const start = performance.now();
    let weiter = false;
    const geheWeiter = (): void => {
      if (weiter || !lebt) return;
      weiter = true;
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      o.beiWecken();
    };
    const nachDemTon = (): void => {
      const rest = WECKEN_MINDESTENS_MS - (performance.now() - start);
      if (rest > 0) timer = window.setTimeout(geheWeiter, rest);
      else geheWeiter();
    };
    timer = window.setTimeout(geheWeiter, WECKEN_SPAETESTENS_MS);
    ctx.audio
      .fest('gutenacht.wecken')
      .catch((f: unknown) => {
        o.melde(f);
        return 'fertig' as const;
      })
      .then(nachDemTon)
      .catch(o.melde);
  }

  const wurzel = el(
    'button',
    {
      klasse: 'gute-nacht',
      testid: 'gute-nacht',
      attr: { 'aria-label': 'Die Tiere schlafen. Antippen weckt sie.' },
      beiKlick: wecke,
    },
    el('span', { klasse: 'gute-nacht__mond', attr: { 'aria-hidden': 'true' } }, icon('mond', { groesse: 56, strich: 1.6 })),
    bett,
    sonne,
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
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
      wurzel.remove();
    },
  };
}
