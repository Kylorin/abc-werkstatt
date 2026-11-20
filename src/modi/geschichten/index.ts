/**
 * F6 Wer hilft? (Bau „spiele“). Spezifikation: docs/konzept-spass-und-lernen.md (F6).
 *
 * Geschichten stehen beim PROBLEMTIER (`Tier.situationen`). Ohne eine Situation in irgendeinem
 * Paket fehlt die Arbeit im Regal (`kacheln()` liefert []).
 *
 * Ablauf: Problemtier groß, entsättigt, leises Wackeln → Erzählung (`audio.problem`, sonst der
 * Text über die Live-Stimme) → „Wer kann helfen?“ (`frage.wer-hilft`) → 2 Helfer-Medaillons (der
 * Helfer + ein anderes Tier, die Stimme verrät nichts). Falscher: sagt seinen „kann“-Satz, lenkt
 * freundlich um (`audio.nichtIch`), die Frage kommt wieder. Richtiger: fliegt heran, sein Name
 * liegt als Schattenwort da, nur der Anlaut fehlt (2 Tasten; Einstellung `geschichtenSchreiben`,
 * nur mit gültigem Einzel-Anlaut). Danach Lösung (`audio.loesung`), beide freuen sich, Weiter-Knopf.
 * Nach 3 Geschichten (höchstens `rundenBisGuteNacht`) das sanfte Ende; ein Tipp weckt.
 *
 * testids: geschichte (data-situation, data-schritt), geschichte-problemtier, helfer-wahl-<id>,
 * geschichte-schreiben, geschichte-loesung, geschichte-weiter, geschichte-ende.
 */
import { schreibwort } from '../../kern/alphabet';
import { el } from '../../kern/dom';
import { situationTon, tierEinzel, tierTon } from '../../kern/tierton';
import type {
  Ausgang,
  Dienste,
  KettenSchritt,
  Kontext,
  Modus,
  PaketDienst,
  RegalKachel,
  SituationTreffer,
  Tier,
  TierTreffer,
} from '../../kern/vertrag';
import { ANLAUT_LAUTE } from '../../kern/vertrag';
import { anlautBuchstabe } from '../../paket/anlaut';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeFreude } from '../tiere/freude';
import { elternzeile, hoechstens, huepfe, leerHinweis, medaillonKnopf, sicher, weiterKnopf } from './gemeinsam';
import { aufbauFuer, erzeugeLegearbeit, type Legearbeit } from './legearbeit';
import './geschichten.css';

/** Nach so vielen Geschichten kommt das sanfte Ende (Konzept F6). */
const GESCHICHTEN_BIS_ENDE = 3;
/** Obergrenze, bis die Helfer erscheinen — nur gegen eine hängende Sprachausgabe. */
const ERZAEHLUNG_HOECHSTENS_MS = 12_000;
/** Obergrenze fürs Nachklingen, bevor die Lösung kommt. */
/** Obergrenze fürs Nachklingen (hängende Sprachausgabe): alle Buchstaben, Pause und Name — wächst mit dem Wort. */
const nachklangHoechstensMs = (wort: string): number => 3_500 + 1_600 * Array.from(wort).length;

const ELTERNFRAGEN = ['Wer könnte noch helfen?', 'Was hättest du gemacht?', 'Wem hast du schon einmal geholfen?'];

let sitzung: Sitzung | undefined;
/** Nächste Geschichte (bleibt während der App-Sitzung: beim Wiederkommen geht es weiter). */
let naechsteGeschichte = 0;

/** Alle Situationen aller Pakete in fester Reihenfolge (Paket-Titel, Tier, Situation). */
export async function alleSituationen(pakete: PaketDienst): Promise<SituationTreffer[]> {
  const liste: SituationTreffer[] = [];
  for (const paket of await pakete.liste()) {
    for (const problemtier of paket.tiere) {
      for (const situation of problemtier.situationen ?? []) {
        const helfer = paket.tiere.find((t) => t.id === situation.helfer);
        if (!helfer || helfer.id === problemtier.id) {
          throw new Error(`Im Paket „${paket.titel}“ passt der Helfer der Geschichte „${situation.id}“ nicht. Bitte das Paket neu importieren.`);
        }
        liste.push({ paket, problemtier, helfer, situation });
      }
    }
  }
  return liste;
}

async function kacheln(dienste: Dienste): Promise<RegalKachel[]> {
  return (await alleSituationen(dienste.pakete)).length ? [{ titel: 'Wer hilft?' }] : [];
}

const zufall = <T>(a: readonly T[]): T | undefined => a[Math.floor(Math.random() * a.length)];

function mische<T>(a: readonly T[]): T[] {
  return [...a].sort(() => Math.random() - 0.5);
}

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;
  const meldung = erzeugeMeldung();
  const melde = meldung.melde;

  const geschichten = await alleSituationen(ctx.pakete);
  if (!s.lebt) return;
  if (geschichten.length === 0) {
    flaeche.append(leerHinweis(ctx, 'In den Tier-Paketen gibt es noch keine Geschichte.'));
    return;
  }

  flaeche.classList.add('flaeche--geschichten');
  s.nachher(() => flaeche.classList.remove('flaeche--geschichten'));
  const platz = el('div', { klasse: 'geschichten' });
  flaeche.append(platz, meldung.el);
  s.nachher(() => ctx.audio.stopp());

  let arbeit: Legearbeit | undefined;
  s.nachher(() => arbeit?.zerstoere());
  let runden = 0;
  /** Tiere dieser Sitzung (für das sanfte Ende: nur sie liegen auf der Decke). */
  const dabei = new Map<string, { tier: Tier; bildUrl: string }>();
  const grenze = (): number => Math.max(1, Math.min(GESCHICHTEN_BIS_ENDE, ctx.einstellungen.lese().rundenBisGuteNacht));

  const bild = (t: TierTreffer): Promise<string> => ctx.pakete.bildUrl(t.paket.id, t.tier.bild);
  const sprichName = (t: TierTreffer): Promise<Ausgang> =>
    tierEinzel(ctx, t, 'name').then((a) => a ?? ctx.audio.wort(schreibwort(t.tier.name)));
  /** Fester Satz; ein fehlender wird gemeldet, die Geschichte läuft weiter. */
  const fest = (k: string, p?: Record<string, string>): KettenSchritt => sicher(() => ctx.audio.fest(k, p), melde);
  /** Geräusch nur, wenn es im Verzeichnis steht (Ausschmückung, kein Satz). */
  const geraeusch = async (k: string): Promise<KettenSchritt[]> =>
    (await ctx.audio.hatFest(k).catch((f: unknown) => (melde(f), false))) ? [fest(k)] : [];

  async function zeigeGeschichte(g: SituationTreffer): Promise<void> {
    arbeit?.zerstoere();
    arbeit = undefined;
    ctx.audio.stopp();
    const problem: TierTreffer = { paket: g.paket, tier: g.problemtier };
    const helfer: TierTreffer = { paket: g.paket, tier: g.helfer };
    const andere = zufall(g.paket.tiere.filter((t) => t.id !== g.problemtier.id && t.id !== g.helfer.id));
    const wahl: TierTreffer[] = mische([helfer, ...(andere ? [{ paket: g.paket, tier: andere }] : [])]);
    const [problemBild, ...wahlBilder] = await Promise.all([bild(problem), ...wahl.map(bild)]);
    if (!s.lebt) return;
    dabei.set(`${g.paket.id}/${g.problemtier.id}`, { tier: g.problemtier, bildUrl: problemBild ?? '' });

    const buehne = el('div', { klasse: 'geschichte__buehne' });
    const helferPlatz = el('div', { klasse: 'geschichte__helfer' });
    const arbeitPlatz = el('div', { klasse: 'geschichte__arbeit' });
    const wurzel = el(
      'div',
      { klasse: 'geschichte', testid: 'geschichte', attr: { 'data-situation': g.situation.id, 'data-schritt': 'problem' } },
      buehne,
      helferPlatz,
      arbeitPlatz,
      elternzeile(ctx, zufall(ELTERNFRAGEN) ?? '') ?? '',
    );
    // Jeder Satz ist durch Antippen abbrechbar (Tipp neben die Knöpfe).
    wurzel.addEventListener('click', (ev) => {
      if (ev.target === wurzel || ev.target === buehne || ev.target === helferPlatz) ctx.audio.stopp();
    });
    platz.replaceChildren(wurzel);
    const schritt = (x: string): void => {
      wurzel.dataset.schritt = x;
    };

    const problemKnopf = medaillonKnopf(problemBild ?? '', g.problemtier, {
      testid: 'geschichte-problemtier',
      klasse: 'geschichte__problemtier',
      beiKlick: () => void erzaehleProblem(),
    });
    buehne.replaceChildren(problemKnopf);

    const erzaehlung = (): KettenSchritt =>
      sicher(() => situationTon(ctx, problem, g.situation, 'problem').then((a) => a ?? ctx.audio.satz(g.situation.problem)), melde);

    async function erzaehleProblem(): Promise<Ausgang> {
      return ctx.audio.kette([...(await geraeusch('geraeusch.oh-oh')), erzaehlung(), fest('frage.wer-hilft')]);
    }

    let entschieden = false;
    function zeigeHelfer(): void {
      if (!s.lebt || entschieden || helferPlatz.childElementCount) return;
      schritt('frage');
      helferPlatz.replaceChildren(
        ...wahl.map((t, i) =>
          medaillonKnopf(wahlBilder[i] ?? '', t.tier, {
            testid: `helfer-wahl-${t.tier.id}`,
            klasse: 'geschichte__wahl',
            beiKlick: () => (t.tier.id === g.helfer.id ? void richtig(t, wahlBilder[i] ?? '') : falsch(t)),
          }),
        ),
      );
    }

    function falsch(t: TierTreffer): void {
      if (entschieden) return;
      schritt('umlenken');
      const knopf = helferPlatz.querySelector(`[data-testid="helfer-wahl-${t.tier.id}"]`);
      if (knopf) huepfe(knopf);
      const schritte: KettenSchritt[] = [];
      if (t.tier.audio?.kann) schritte.push(sicher(() => tierEinzel(ctx, t, 'kann'), melde));
      else if (t.tier.kann) schritte.push(sicher(() => ctx.audio.satz(t.tier.kann ?? ''), melde));
      if (t.tier.audio?.nichtIch?.length) schritte.push(sicher(() => tierTon(ctx, t, 'nichtIch'), melde));
      schritte.push(fest('frage.wer-hilft'));
      void ctx.audio.kette(schritte).then(() => {
        if (!entschieden && s.lebt) schritt('frage');
      });
    }

    async function richtig(t: TierTreffer, helferBild: string): Promise<void> {
      if (entschieden) return;
      entschieden = true;
      ctx.audio.stopp();
      dabei.set(`${g.paket.id}/${g.helfer.id}`, { tier: g.helfer, bildUrl: helferBild });
      ctx.notizen.merke({ art: 'tier', wert: g.helfer.name });
      helferPlatz.replaceChildren();
      const herangeflogen = medaillonKnopf(helferBild, g.helfer, {
        testid: 'geschichte-helfer',
        klasse: 'geschichte__helfer-da',
        beiKlick: () => void spiele(sprichName(t), melde),
      });
      buehne.append(herangeflogen);
      problemKnopf.classList.add('geschichte__problemtier--getroest');

      const laut = anlautBuchstabe(g.helfer);
      // `einladung.<laut>` gibt es nur für ANLAUT_LAUTE (ohne c, q, x, y, ß) — sonst ohne Schreiben.
      const schreibt = ctx.einstellungen.lese().geschichtenSchreiben && laut !== undefined && ANLAUT_LAUTE.includes(laut);
      if (!schreibt) {
        void spiele(sprichName(t), melde);
        s.warte(1200, () => zeigeLoesung());
        return;
      }
      schritt('schreiben');
      const wort = schreibwort(g.helfer.name);
      const e = ctx.einstellungen.lese();
      let neu: Legearbeit;
      try {
        neu = erzeugeLegearbeit({
          ctx,
          wort,
          aufbau: aufbauFuer(wort, 1, e.kindAnfang ? [e.kindAnfang] : []),
          artikel: g.helfer.artikel,
          hilfeNach: e.hilfeNach,
          sprichWort: () => sprichName(t),
          melde,
          beiGeschafft(klang) {
            ctx.notizen.merke({ art: 'laut', wert: laut });
            void hoechstens(s, klang, nachklangHoechstensMs(wort)).then(() => zeigeLoesung());
          },
        });
      } catch (f) {
        melde(f);
        zeigeLoesung();
        return;
      }
      arbeit = neu;
      arbeitPlatz.replaceChildren(el('div', { klasse: 'geschichte__schreiben', testid: 'geschichte-schreiben' }, neu.el));
      void spiele(ctx.audio.fest('einladung.{laut}', { laut }), melde);
    }

    let geloest = false;
    function zeigeLoesung(): void {
      if (!s.lebt || geloest) return;
      geloest = true;
      arbeit?.zerstoere();
      arbeit = undefined;
      schritt('loesung');
      runden++;
      buehne.replaceChildren();
      const freuen = el(
        'div',
        { klasse: 'geschichte__loesung', testid: 'geschichte-loesung' },
        el('div', { klasse: 'geschichte__freude' }, erzeugeFreude({ bildUrl: problemBild ?? '', alt: `${g.problemtier.artikel} ${g.problemtier.name}` })),
        el('div', { klasse: 'geschichte__freude' }, erzeugeFreude({ bildUrl: dabei.get(`${g.paket.id}/${g.helfer.id}`)?.bildUrl ?? '', alt: `${g.helfer.artikel} ${g.helfer.name}` })),
      );
      arbeitPlatz.replaceChildren(freuen, weiterKnopf('geschichte-weiter', 'Weiter', () => weiter()));
      const loesung = sicher(
        () => situationTon(ctx, problem, g.situation, 'loesung').then((a) => a ?? ctx.audio.satz(g.situation.loesung)),
        melde,
      );
      void geraeusch('geraeusch.loesung').then((vorher) => {
        if (s.lebt) void ctx.audio.kette([...vorher, loesung, fest('geschichte.gemeinsam')]);
      });
    }

    void hoechstens(s, erzaehleProblem(), ERZAEHLUNG_HOECHSTENS_MS).then(zeigeHelfer);
  }

  function weiter(): void {
    ctx.audio.stopp();
    if (runden >= grenze()) {
      zeigeEnde();
      return;
    }
    const g = geschichten[naechsteGeschichte % geschichten.length];
    naechsteGeschichte++;
    if (g) void zeigeGeschichte(g).catch(melde);
  }

  /** Sanftes Ende: nur die Tiere DIESER Sitzung kuscheln sich auf die Decke, warmes Licht. */
  function zeigeEnde(): void {
    arbeit?.zerstoere();
    arbeit = undefined;
    const ende = el(
      'button',
      {
        klasse: 'geschichte-ende',
        testid: 'geschichte-ende',
        attr: { 'aria-label': 'Aufwecken' },
        beiKlick: () => {
          runden = 0;
          dabei.clear();
          weiter();
        },
      },
      el('span', { klasse: 'geschichte-ende__decke', attr: { 'aria-hidden': 'true' } }),
      el(
        'span',
        { klasse: 'geschichte-ende__tiere' },
        ...[...dabei.values()].map((d) => el('img', { klasse: 'geschichte-ende__tier', attr: { src: d.bildUrl, alt: `${d.tier.artikel} ${d.tier.name} schläft`, draggable: 'false' } })),
      ),
    );
    platz.replaceChildren(ende);
    void ctx.audio.kette([fest('geschichte.ende')]);
  }

  weiter();
}

export const modus: Modus = {
  id: 'geschichten',
  titel: 'Wer hilft?',
  icon: 'helfen',
  kacheln,
  begleitkarte:
    'Hört die kleine Geschichte gemeinsam und lasst das Kind den Helfer holen. Ein falscher Helfer ist kein Fehler, er erzählt nur, was er kann. Danach könnt ihr fragen, wer sonst noch helfen könnte.',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
