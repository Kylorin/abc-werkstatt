/**
 * Tier-Modus (Bau „schreiben"). Route: navigiere('tiere', paketId) → ctx.param = Paket-ID.
 *
 * Großes Tierbild (data-testid="tier-bild") über dem Wort, Artikel klein davor (wird nicht
 * geschrieben). Reihenfolge nach Schwierigkeit, der Reihe nach statt zufällig. Mit Vorlage
 * (Schattenbuchstaben) oder nur Bild + Laut-Hilfe (Antippen des Bildes spricht den Namen),
 * je nach Einstellung `tierModusMitVorlage`. Das ganze Alphabet liegt bereit wie der Holzkasten:
 * beim Tier sucht das Kind selbst. Geschafft → das Tier freut sich (data-testid="tier-freude");
 * das nächste Tier kommt erst, wenn die Freude zu Ende gesprochen ist (mindestens ~4,6 s).
 *
 * Fortschritt je Paket bleibt gespeichert (IndexedDB): wer den Modus verlässt, macht beim
 * nächsten Mal beim nächsten Tier weiter statt wieder beim leichtesten.
 */
import { createStore, get, set } from 'idb-keyval';
import { schreibwort } from '../../kern/alphabet';
import { wortSchwierigkeit } from '../../kern/woerter';
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Kontext, Modus, Tier, TierPaket, TierTreffer } from '../../kern/vertrag';
import { Sitzung, erzeugeMeldung, warteAufSprache } from '../nachfuellen/sitzung';
import { erzeugeWortarbeit, type Wortarbeit } from '../nachfuellen/wortarbeit';
import { erzeugeFreude, sprichFreude, sprichTierName, tierBezeichnung } from './freude';
import './tiere.css';

const FREUDE_DAUER_MS = 4600;
/** Obergrenze nur gegen eine hängende Sprachausgabe; normal endet die Freude vorher. */
const FREUDE_HOECHSTENS_MS = 8500;

const fortschritt = createStore('abc-werkstatt-fortschritt', 'kv');
const fortschrittSchluessel = (paketId: string): string => `tiere:${paketId}`;

/** Gespeicherte Position in der Reihe (Index des nächsten Tiers), 0 wenn noch keine. */
async function ladePosition(paketId: string): Promise<number> {
  const roh = await get<unknown>(fortschrittSchluessel(paketId), fortschritt);
  if (roh === undefined) return 0;
  if (typeof roh !== 'number' || !Number.isInteger(roh) || roh < 0) throw new Error('Gespeicherter Tier-Fortschritt ist beschädigt.');
  return roh;
}

let sitzung: Sitzung | undefined;

/** Leicht vor schwer — dieselbe Bewertung wie beim Nachfüllen (`wortSchwierigkeit`). */
export function schwierigkeit(tier: Tier): number {
  return wortSchwierigkeit(schreibwort(tier.name));
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
  let position = await ladePosition(gewaehlt.id);
  if (!s.lebt) return;
  let runde = 0;

  function merkePosition(): void {
    set(fortschrittSchluessel(gewaehlt.id), position % reihe.length, fortschritt).catch(meldung.melde);
  }

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
        merkePosition(); // geschafft → beim nächsten Öffnen geht es mit dem nächsten Tier weiter
        const aktuell = (): boolean => s.lebt && meineRunde === runde;
        const gesprochen = letzterLaut.then((a) => {
          // abgebrochen: das Kind hat schon etwas Neues angetippt — die Freude-Kette nicht drüberlegen.
          if (a !== 'abgebrochen' && aktuell()) return sprichFreude(ctx, treffer, wort, aktuell, meldung.melde);
        });
        void warteAufSprache(s, gesprochen, FREUDE_DAUER_MS, FREUDE_HOECHSTENS_MS).then(() => {
          if (!aktuell()) return;
          ctx.audio.stopp();
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

