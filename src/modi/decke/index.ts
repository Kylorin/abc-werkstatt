/**
 * Wer ist unter der Decke? (F3) — Lausch-Versteck mit Hilfeleiter.
 *
 * In der Mitte wölbt sich eine Patchwork-Decke und wackelt leise. Jeder Tipp auf die Decke gibt
 * einen deutlicheren Hinweis (`data-hinweis` 0 → 4):
 *   1. Rätselsatz ohne Namen (`audio.raetsel`; vorher der Tierlaut, falls das Paket ihn hat),
 *   2. „Ich fange mit mmm an!“ (`audio.ichFange`, sonst `frage.wer-faengt-an.<laut>`),
 *   3. die erste Silbe (`audio.silben[0]`, sonst gedehnter Name bzw. gedehnter Laut),
 *   4. die Decke fliegt weg, das Tier sagt „Ich bin …!“ und freut sich. Die Auflösung kommt IMMER.
 * Stufe 0: dazu 2 Tier-Medaillons (gesuchtes + stark kontrastierender Anlaut). Stufe 1: 2 große
 * Buchstaben. Das richtige zieht die Decke weg, das andere sagt nur freundlich seinen Namen bzw.
 * klingt mit seinem Laut — Danebentippen ist nie lustiger als der Treffer.
 * Erst nach der Auflösung erscheint klein der Anlaut-Buchstabe (antippbar). Nach 3 Tieren Gute Nacht.
 */
import { anzeigeZeichen, artVon, schreibwort } from '../../kern/alphabet';
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { tierGeraeusch, tierNr, tierTon } from '../../kern/tierton';
import {
  ANLAUT_LAUTE,
  type AnlautTreffer,
  type Ausgang,
  type Buchstabe,
  type Dienste,
  type KettenSchritt,
  type Kontext,
  type Modus,
  type RegalKachel,
  type TierPaket,
} from '../../kern/vertrag';
import { kontrastiert, tiereMitAnlaut, waehleAblenker } from '../../paket/anlaut';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeFreude, erzeugeMedaillon, SPRECH_PAUSE_MS, sprichFreudeSatz, sprichTierName, tierBezeichnung } from '../tiere/freude';
import { erzeugeGuteNacht } from '../tiere/gute-nacht';
import { erzeugeDeckenStoff } from './stoff';
import './decke.css';

/** Nach so vielen Tieren schlägt die Decke vor, schlafen zu gehen (F3), höchstens `rundenBisGuteNacht`. */
const TIERE_BIS_GUTE_NACHT = 3;
const LETZTER_HINWEIS = 4;

let sitzung: Sitzung | undefined;

/**
 * Tiere, die unter die Decke dürfen: mit gültigem Einzel-Anlaut UND festen Sätzen dafür
 * (`frage.wer-faengt-an.<laut>`, `einladung.<laut>` gibt es nur für ANLAUT_LAUTE — ohne c, q, x, y, ß).
 */
export function deckenTiere(pakete: readonly TierPaket[]): AnlautTreffer[] {
  return [...tiereMitAnlaut(pakete).values()].flat().filter((t) => ANLAUT_LAUTE.includes(t.laut));
}

/** Regal (B1): ohne passendes Tier fehlt die Arbeit einfach — keine Kachel vor einem Elternhinweis. */
async function kacheln(dienste: Dienste): Promise<RegalKachel[]> {
  return deckenTiere(await dienste.pakete.liste()).length ? [{ titel: modus.titel }] : [];
}

/** Ausgang eines optionalen Tons: fehlt das Audio (`undefined`), ist der Schritt einfach fertig. */
const oder = async (p: Promise<Ausgang | undefined>, sonst: () => Promise<Ausgang>): Promise<Ausgang> => (await p) ?? sonst();

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;
  const meldung = erzeugeMeldung();
  const buehne = el('div', { klasse: 'decke-spiel' });
  flaeche.classList.add('flaeche--decke');
  s.nachher(() => flaeche.classList.remove('flaeche--decke'));
  flaeche.append(buehne, meldung.el);

  const alle = deckenTiere(await ctx.pakete.liste());
  if (!s.lebt) return;
  if (alle.length === 0) {
    buehne.append(el('p', { klasse: 'hinweis', text: 'Für dieses Spiel braucht ein Tier-Paket Tiere mit Anlaut. Im Elternbereich ein passendes Paket importieren.' }));
    return;
  }

  let bild = 0;
  let aufraeumen: (() => void) | undefined;
  s.nachher(() => aufraeumen?.());
  const sitzungsTiere: AnlautTreffer[] = [];
  let runden = 0;
  let letztes: AnlautTreffer | undefined;

  function zeige(inhalt: HTMLElement, weg?: () => void): number {
    aufraeumen?.();
    aufraeumen = weg;
    buehne.replaceChildren(inhalt);
    return ++bild;
  }

  /** Nächstes Tier: zufällig, aber nie dasselbe zweimal hintereinander. */
  function waehle(): AnlautTreffer {
    const auswahl = alle.length > 1 ? alle.filter((t) => t !== letztes) : alle;
    return auswahl[Math.floor(Math.random() * auswahl.length)] as AnlautTreffer;
  }

  async function runde(): Promise<void> {
    const gesucht = waehle();
    letztes = gesucht;
    const stufe = ctx.einstellungen.lese().deckeStufe;
    const { tier, laut } = gesucht;
    const wort = schreibwort(tier.name);
    const partner = alle.filter((t) => t.tier !== tier && kontrastiert(laut, t.laut));
    const anderes = partner[Math.floor(Math.random() * partner.length)];
    const [url, andereUrl] = await Promise.all([
      ctx.pakete.bildUrl(gesucht.paket.id, tier.bild),
      anderes ? ctx.pakete.bildUrl(anderes.paket.id, anderes.tier.bild) : Promise.resolve(undefined),
    ]);
    if (!s.lebt) return;

    let hinweis = 0;
    let geloest = false;
    const decke = el(
      'button',
      {
        klasse: 'decke',
        testid: 'decke',
        attr: { 'data-hinweis': 0, 'data-tier': tier.id, 'aria-label': 'Die Decke – antippen für einen Hinweis' },
        beiKlick: () => tippAufDecke(),
      },
      erzeugeDeckenStoff({ form: 'beule', klasse: 'decke__stoff' }),
    );
    const versteck = el('div', { klasse: 'decke__versteck' }, decke);
    const wahl = el('div', { klasse: 'decke__wahl' });
    const unten = el('div', { klasse: 'decke__unten' });
    const wurzel = el('div', { klasse: 'decke-runde', testid: 'decke-stufe', attr: { 'data-stufe': stufe } }, versteck, wahl, unten);
    const meinBild = zeige(wurzel);
    const aktuell = (): boolean => s.lebt && meinBild === bild;

    /** Der Ton zu Hinweis `h` (1–3). */
    function hinweisTon(h: number): Promise<Ausgang> {
      if (h === 1) {
        const schritte: KettenSchritt[] = [];
        if (tier.audio?.geraeusch?.length) schritte.push(async () => (await tierGeraeusch(ctx, gesucht)) ?? 'fertig');
        schritte.push(() =>
          oder(tierNr(ctx, gesucht, 'raetsel', 0), () => (tier.raetsel?.[0] ? ctx.audio.satz(tier.raetsel[0]) : ctx.audio.fest('frage.wer-unter-decke'))),
        );
        return ctx.audio.kette(schritte, 400);
      }
      if (h === 2) return oder(tierTon(ctx, gesucht, 'ichFange'), () => ctx.audio.fest('frage.wer-faengt-an.{laut}', { laut }));
      return oder(tierNr(ctx, gesucht, 'silben', 0), () => oder(tierTon(ctx, gesucht, 'anlautName'), () => ctx.audio.lautLang(laut)));
    }

    function tippAufDecke(): void {
      if (!aktuell() || geloest) return;
      hinweis = Math.min(LETZTER_HINWEIS, hinweis + 1);
      decke.dataset.hinweis = String(hinweis);
      // Zucken einmal abspielen; danach (animationend) atmet die Beule wieder weiter.
      animiere(decke, 'decke--zuckt');
      if (hinweis >= LETZTER_HINWEIS) loese();
      else void spiele(hinweisTon(hinweis), meldung.melde);
    }

    /** Die Decke fliegt weg, das Tier kommt hervor, sagt „Ich bin …!“ und freut sich groß. */
    function loese(): void {
      if (geloest) return;
      geloest = true;
      hinweis = LETZTER_HINWEIS;
      decke.dataset.hinweis = String(LETZTER_HINWEIS);
      decke.classList.add('decke--weg');
      wahl.replaceChildren();
      runden++;
      sitzungsTiere.push(gesucht);
      ctx.notizen.merke({ art: 'tier', wert: tier.name });
      ctx.notizen.merke({ art: 'laut', wert: laut });
      const freude = erzeugeFreude({ bildUrl: url, alt: tierBezeichnung(gesucht), tier });
      versteck.append(el('div', { klasse: 'decke__tier', testid: 'decke-tier' }, freude));
      const anlautKnopf = el('button', {
        klasse: ['decke__anlaut', artVon(laut)],
        testid: 'decke-anlaut',
        attr: { 'aria-label': `Anfangslaut ${laut}` },
        text: anzeigeZeichen(laut, ctx.einstellungen.lese().grossbuchstaben),
        beiKlick: () => void spiele(ctx.audio.laut(laut), meldung.melde),
      });
      const weiter = el(
        'button',
        {
          klasse: 'knopf knopf--gross decke__weiter',
          testid: 'decke-weiter',
          attr: { 'aria-label': 'Noch ein Tier' },
          beiKlick: () => {
            if (!aktuell()) return;
            ctx.audio.stopp();
            if (runden >= Math.min(TIERE_BIS_GUTE_NACHT, ctx.einstellungen.lese().rundenBisGuteNacht)) guteNacht();
            else runde().catch(meldung.melde);
          },
        },
        icon('decke', { groesse: 40, strich: 1.8 }),
        icon('weiter', { groesse: 30, strich: 2.4 }),
      );
      unten.replaceChildren(anlautKnopf, weiter);
      const schritte: KettenSchritt[] = [];
      void ctx.audio
        .hatFest('geraeusch.decke-weg')
        .then((da) => {
          if (!aktuell()) return;
          if (da) schritte.push(() => ctx.audio.fest('geraeusch.decke-weg'));
          schritte.push(
            () => oder(tierTon(ctx, gesucht, 'ichBin'), () => sprichTierName(ctx, gesucht, wort)),
            () => sprichFreudeSatz(ctx, gesucht),
          );
          return ctx.audio.kette(schritte.map((sch) => () => (aktuell() ? sch() : Promise.resolve<Ausgang>('abgebrochen'))), SPRECH_PAUSE_MS);
        })
        .catch(meldung.melde);
    }

    /** Daneben: freundlich, ohne Show — danach wiederholt die Decke den letzten Hinweis. */
    function danebenDann(ton: () => Promise<Ausgang>): void {
      const schritte: KettenSchritt[] = [ton, () => (hinweis > 0 ? hinweisTon(hinweis) : ctx.audio.fest('frage.wer-unter-decke'))];
      ctx.audio.kette(schritte, SPRECH_PAUSE_MS).catch(meldung.melde);
    }

    if (stufe === 0 && anderes && andereUrl) {
      const paar: [AnlautTreffer, string][] = [[gesucht, url], [anderes, andereUrl]];
      if (Math.random() < 0.5) paar.reverse();
      wahl.replaceChildren(
        ...paar.map(([t, u]) =>
          el(
            'button',
            {
              klasse: 'decke__medaillon',
              testid: `decke-wahl-${t.tier.id}`,
              attr: { 'aria-label': tierBezeichnung(t) },
              beiKlick: () => {
                if (!aktuell() || geloest) return;
                if (t === gesucht) loese();
                else danebenDann(() => oder(tierTon(ctx, t, 'anlautName'), () => sprichTierName(ctx, t, schreibwort(t.tier.name))));
              },
            },
            erzeugeMedaillon(u, tierBezeichnung(t), { klasse: 'decke__medaillon-bild' }),
          ),
        ),
      );
    } else if (stufe === 1) {
      const ablenker = waehleAblenker(laut, ANLAUT_LAUTE.filter((b) => b !== laut), 1)[0] as Buchstabe;
      const gross = ctx.einstellungen.lese().grossbuchstaben;
      const paar = ANLAUT_LAUTE.filter((b) => b === laut || b === ablenker);
      wahl.replaceChildren(
        ...paar.map((b) =>
          el('button', {
            klasse: ['taste', 'decke__taste'],
            testid: `decke-wahl-taste-${b}`,
            attr: { 'data-art': artVon(b), 'aria-label': `Buchstabe ${b}` },
            text: anzeigeZeichen(b, gross),
            beiKlick: () => {
              if (!aktuell() || geloest) return;
              if (b === laut) loese();
              else danebenDann(() => ctx.audio.laut(b));
            },
          }),
        ),
      );
    }

    // Einstieg: „Wer ist da unter der Decke?“ (Decke raschelt vorher, falls vertont).
    const start: KettenSchritt[] = [];
    if (await ctx.audio.hatFest('geraeusch.decke-wackelt')) start.push(() => ctx.audio.fest('geraeusch.decke-wackelt'));
    if (!aktuell()) return;
    start.push(() => ctx.audio.fest('frage.wer-unter-decke'));
    ctx.audio.kette(start, 300).catch(meldung.melde);
  }

  function guteNacht(): void {
    const nacht = erzeugeGuteNacht({
      ctx,
      tiere: sitzungsTiere,
      melde: meldung.melde,
      beiWecken: () => {
        runden = 0;
        sitzungsTiere.length = 0;
        runde().catch(meldung.melde);
      },
    });
    zeige(nacht.el, () => nacht.zerstoere());
  }

  await runde();
}

export const modus: Modus = {
  id: 'decke',
  titel: 'Wer ist unter der Decke?',
  icon: 'decke',
  kacheln,
  begleitkarte:
    'Raten ist ein Angebot, keine Pflicht: Jeder Tipp auf die Decke gibt einen deutlicheren Hinweis, die Auflösung kommt immer. Flüstern Sie den Anfangslaut mit („iii …“). Lauschspiel für unterwegs: „Wer fängt mit mmm an?“',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
