/**
 * Tier-Modus (Bau „schreiben"). Route: navigiere('tiere', paketId) → ctx.param = Paket-ID.
 *
 * Großes Tierbild (data-testid="tier-bild") über dem Wort, Artikel klein davor (wird nicht
 * geschrieben). Reihenfolge nach Schwierigkeit, der Reihe nach statt zufällig. Mit Vorlage
 * (Schattenbuchstaben) oder nur Bild + Laut-Hilfe (Antippen des Bildes spricht den Namen),
 * je nach Einstellung `tierModusMitVorlage`. Das ganze Alphabet liegt bereit wie der Holzkasten:
 * beim Tier sucht das Kind selbst. Geschafft → das Tier freut sich (data-testid="tier-freude"),
 * nach ~4,6 s kommt das nächste Tier.
 */
import { schreibwort } from '../../kern/alphabet';
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Kontext, Modus, Tier, TierPaket, TierTreffer } from '../../kern/vertrag';
import { Sitzung, erzeugeMeldung } from '../nachfuellen/sitzung';
import { erzeugeWortarbeit, type Wortarbeit } from '../nachfuellen/wortarbeit';
import { erzeugeFreude, sprichFreude, sprichTierName, tierBezeichnung } from './freude';
import './tiere.css';

const FREUDE_DAUER_MS = 4600;

let sitzung: Sitzung | undefined;

/** Leicht vor schwer: kurze Wörter, wenige verschiedene Buchstaben, keine Umlaute/ß/Doppelkonsonanten zuerst. */
export function schwierigkeit(tier: Tier): number {
  const w = schreibwort(tier.name);
  const zeichen = Array.from(w);
  const verschieden = new Set(zeichen).size;
  const besonders = zeichen.filter((z) => 'äöüßqxyc'.includes(z)).length;
  const verbindungen = (w.match(/sch|ch|ck|qu|ei|eu|äu|ie|pf/g) ?? []).length;
  return zeichen.length * 10 + verschieden * 2 + besonders * 6 + verbindungen * 4;
}

export function reiheNachSchwierigkeit(tiere: readonly Tier[]): Tier[] {
  return [...tiere].sort((a, b) => schwierigkeit(a) - schwierigkeit(b) || a.name.localeCompare(b.name, 'de'));
}

function zeigeHinweis(flaeche: HTMLElement, ctx: Kontext, text: string): void {
  flaeche.append(
    el(
      'div',
      { klasse: 'hinweis stapel mitte' },
      el('p', { text }),
      el('button', { klasse: 'knopf', beiKlick: () => ctx.navigiere('start') }, icon('zurueck'), el('span', { text: 'Zum Start' })),
    ),
  );
}

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;

  const id = ctx.param;
  if (!id) {
    zeigeHinweis(flaeche, ctx, 'Hier fehlt ein Tier-Paket. Bitte auf dem Start ein Paket wählen.');
    return;
  }
  const paket: TierPaket | undefined = await ctx.pakete.hole(id);
  if (!s.lebt) return;
  if (!paket) {
    zeigeHinweis(flaeche, ctx, 'Dieses Tier-Paket ist nicht mehr auf dem Gerät.');
    return;
  }
  const gewaehlt: TierPaket = paket;
  ctx.setzeTitel(gewaehlt.titel);
  const reihe = reiheNachSchwierigkeit(paket.tiere);
  if (reihe.length === 0) {
    zeigeHinweis(flaeche, ctx, 'In diesem Tier-Paket ist kein Tier.');
    return;
  }

  const meldung = erzeugeMeldung();
  const buehne = el('div', { klasse: 'tier-buehne' });
  const platz = el('div', { klasse: 'tiere__arbeit' });
  flaeche.classList.add('flaeche--tiere');
  s.nachher(() => flaeche.classList.remove('flaeche--tiere'));
  flaeche.append(buehne, platz, meldung.el);

  let arbeit: Wortarbeit | undefined;
  s.nachher(() => arbeit?.zerstoere());
  let position = 0;
  let runde = 0;

  async function naechstesTier(): Promise<void> {
    const tier = reihe[position % reihe.length];
    position++;
    if (!tier) return;
    const meineRunde = ++runde;
    const treffer: TierTreffer = { paket: gewaehlt, tier };
    const wort = schreibwort(tier.name);
    const bildUrl = await ctx.pakete.bildUrl(treffer.paket.id, tier.bild);
    if (!s.lebt || meineRunde !== runde) return;

    const name = tierBezeichnung(treffer);
    const sprichName = (): void => {
      void sprichTierName(ctx, treffer, wort).catch(meldung.melde);
    };
    buehne.replaceChildren(
      el(
        'button',
        { klasse: 'tier-buehne__knopf', attr: { 'aria-label': `${name} – Namen hören` }, beiKlick: sprichName },
        el('img', { klasse: 'tier-bild erscheint', testid: 'tier-bild', attr: { src: bildUrl, alt: name, draggable: 'false' } }),
      ),
    );

    arbeit?.zerstoere();
    const neu = erzeugeWortarbeit({
      ctx,
      wort,
      vorlage: ctx.einstellungen.lese().tierModusMitVorlage,
      vollesAlphabet: true,
      artikel: tier.artikel,
      melde: meldung.melde,
      beiGeschafft(letzterLaut) {
        buehne.replaceChildren(
          el('button', { klasse: 'tier-buehne__knopf', attr: { 'aria-label': `${name} – Namen hören` }, beiKlick: sprichName }, erzeugeFreude({ bildUrl, alt: name })),
        );
        const aktuell = (): boolean => s.lebt && meineRunde === runde;
        void letzterLaut.then(() => {
          if (aktuell()) return sprichFreude(ctx, treffer, wort, aktuell, meldung.melde);
        });
        s.warte(FREUDE_DAUER_MS, () => {
          naechstesTier().catch(meldung.melde);
        });
      },
    });
    arbeit = neu;
    platz.replaceChildren(neu.el);
  }

  await naechstesTier();
}

export const modus: Modus = {
  id: 'tiere',
  titel: 'Tiere',
  icon: 'tiere',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};

