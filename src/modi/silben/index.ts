/**
 * F5 Silben-Hüpfen (Bau „spiele“). Spezifikation: docs/konzept-spass-und-lernen.md (F5).
 *
 * Wiese mit 3 Medaillons (nur Tiere mit `silben` UND gleich langem `audio.silben`, kurze Namen
 * zuerst). Erster Tipp: das Tier hüpft und sagt seinen Namen, zweiter Tipp: los. Oben das Tier,
 * darunter ein Trommelfleck je Silbe. Antippen des Tiers macht vor (Name, dann Silbe für Silbe mit
 * Hüpfern). Jeder Tipp auf IRGENDEINEN Fleck spielt die NÄCHSTE Silbe — eine falsche Reihenfolge
 * gibt es nicht —, das Tier hüpft auf den Fleck, darunter wächst der Silbenbogen. Nach der letzten
 * Silbe: das ganze Wort, das Tier freut sich. Kein Auto-Weiter.
 *
 * Die gespielte Silbe steht groß (≥ 40 px) in Montessori-Farben je Buchstabe. Quer (Handy) steht
 * alles nebeneinander und passt ohne Scrollen auf den Bildschirm (silben.css).
 *
 * testids: tier-wiese, tier-wahl-<id> (data-bewegung), tier-wahl-andere, silben-tier,
 * silbe-<i> (data-gespielt), silben-bogen, silben-fertig, silben-weiter.
 */
import { artVon, istBuchstabe, schreibwort } from '../../kern/alphabet';
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { tierEinzel, tierNr, tierTon } from '../../kern/tierton';
import type { Ausgang, Dienste, Kontext, Modus, RegalKachel, TierTreffer } from '../../kern/vertrag';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeFreude } from '../tiere/freude';
import { elternzeile, hoechstens, huepfe, leerHinweis, medaillonKnopf, sicher, weiterKnopf } from '../geschichten/gemeinsam';
import './silben.css';

/** So viele Medaillons liegen auf der Wiese (Konzept: 2–3 Dinge pro Bildschirm). */
const WIESE = 3;
/** Rhythmus beim Vormachen zwischen zwei Silben. */
const SILBEN_TAKT_MS = 220;
/** Nach dem letzten Fleck: Freude nach dem Silbenklang, aber spätestens nach dieser Frist (hängt das Audio, wartet das Kind nicht). */
const SILBE_FERTIG_FRIST_MS = 1500;

let sitzung: Sitzung | undefined;
/** Wo die Wiese zuletzt stand (bleibt für „andere Tiere“ während der App-Sitzung). */
let wiesenStart = 0;

/** Silbe Buchstabe für Buchstabe in Montessori-Farben (Vokal blau, Konsonant rot); Fremdzeichen bleiben neutral. */
export function silbeInLauten(silbe: string): HTMLElement[] {
  return Array.from(silbe).map((z) => {
    const b = schreibwort(z);
    return el('span', { klasse: istBuchstabe(b) ? artVon(b) : 'silbe__zeichen', text: z });
  });
}

/** Tiere mit Sprechsilben UND Silben-Audio in gleicher Länge, wenige Silben zuerst. */
export function silbenTiere(treffer: readonly TierTreffer[]): TierTreffer[] {
  return treffer
    .filter(({ tier }) => (tier.silben?.length ?? 0) > 0 && tier.audio?.silben?.length === tier.silben?.length)
    .sort((a, b) => (a.tier.silben?.length ?? 0) - (b.tier.silben?.length ?? 0) || a.tier.name.localeCompare(b.tier.name, 'de'));
}

/** Regal (B1): ohne Tier mit Silben-Ton fehlt die Arbeit einfach — keine Kachel vor einem Elternhinweis. */
async function kacheln(dienste: Dienste): Promise<RegalKachel[]> {
  const pakete = await dienste.pakete.liste();
  return silbenTiere(pakete.flatMap((paket) => paket.tiere.map((tier) => ({ paket, tier })))).length ? [{ titel: modus.titel }] : [];
}

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;
  const meldung = erzeugeMeldung();
  const melde = meldung.melde;

  const pakete = await ctx.pakete.liste();
  if (!s.lebt) return;
  const liste = silbenTiere(pakete.flatMap((paket) => paket.tiere.map((tier) => ({ paket, tier }))));
  if (liste.length === 0) {
    flaeche.append(leerHinweis(ctx, 'Noch kein Tier hat Silben mit Ton. Im Tier-Paket brauchen die Tiere „silben“ und „audio.silben“.'));
    return;
  }

  flaeche.classList.add('flaeche--silben');
  s.nachher(() => flaeche.classList.remove('flaeche--silben'));
  const platz = el('div', { klasse: 'silben' });
  flaeche.append(platz, meldung.el);
  s.nachher(() => ctx.audio.stopp());

  const bilder = new Map<string, Promise<string>>();
  const bildVon = (t: TierTreffer): Promise<string> => {
    const k = `${t.paket.id}/${t.tier.id}`;
    let p = bilder.get(k);
    if (!p) {
      p = ctx.pakete.bildUrl(t.paket.id, t.tier.bild);
      bilder.set(k, p);
    }
    return p;
  };

  const sprichName = (t: TierTreffer): Promise<Ausgang> =>
    tierEinzel(ctx, t, 'name').then((a) => a ?? ctx.audio.wort(schreibwort(t.tier.name)));

  async function zeigeWiese(): Promise<void> {
    const zeigen = Array.from({ length: Math.min(WIESE, liste.length) }, (_, i) => liste[(wiesenStart + i) % liste.length]).filter(
      (t): t is TierTreffer => t !== undefined,
    );
    const urls = await Promise.all(zeigen.map(bildVon));
    if (!s.lebt) return;
    let gewaehlt: string | undefined;
    const knoepfe = zeigen.map((t, i) => {
      const knopf = medaillonKnopf(urls[i] ?? '', t.tier, {
        testid: `tier-wahl-${t.tier.id}`,
        beiKlick: () => {
          if (gewaehlt === t.tier.id) {
            void zeigeTier(t);
            return;
          }
          gewaehlt = t.tier.id;
          for (const k of knoepfe) k.setAttribute('aria-pressed', String(k === knopf));
          huepfe(knopf);
          void spiele(sprichName(t), melde);
        },
      });
      knopf.setAttribute('aria-pressed', 'false');
      return knopf;
    });
    const leiste = el('div', { klasse: 'spiel-wiese__leiste' });
    if (liste.length > WIESE) {
      leiste.append(
        el(
          'button',
          {
            klasse: 'knopf knopf--gross knopf--icon',
            testid: 'tier-wahl-andere',
            attr: { 'aria-label': 'Andere Tiere', title: 'Andere Tiere' },
            beiKlick: () => {
              wiesenStart = (wiesenStart + WIESE) % liste.length;
              ctx.audio.stopp();
              void zeigeWiese().catch(melde);
            },
          },
          icon('medaillons', { groesse: 40, strich: 2 }),
        ),
      );
    }
    platz.replaceChildren(el('div', { klasse: 'spiel-wiese', testid: 'tier-wiese' }, ...knoepfe), leiste);
  }

  async function zeigeTier(t: TierTreffer): Promise<void> {
    ctx.audio.stopp();
    const bildUrl = await bildVon(t);
    if (!s.lebt) return;
    const silben = t.tier.silben ?? [];
    const n = silben.length;
    let naechste = 0;
    let fertig = false;
    let runde = 0;

    const tierKnopf = medaillonKnopf(bildUrl, t.tier, { testid: 'silben-tier', klasse: 'silben__tier', beiKlick: () => vormachen() });
    const huepfer = el('div', { klasse: 'silben__huepfer', attr: { style: `--n: ${n}; --links: 50%` } }, tierKnopf);
    const flecken = silben.map((silbe, i) =>
      el(
        'button',
        {
          klasse: 'silbe',
          testid: `silbe-${i}`,
          attr: { 'data-gespielt': 'nein', 'aria-label': `Silbe ${i + 1}: ${silbe}` },
          beiKlick: () => tippeFleck(),
        },
        el('span', { klasse: 'silbe__text' }, ...silbeInLauten(silbe)),
      ),
    );
    const bogen = el('div', { klasse: 'silben-bogen', testid: 'silben-bogen', attr: { 'aria-hidden': 'true', style: `--n: ${n}` } });
    const fleckenReihe = el('div', { klasse: 'silben__flecken', attr: { style: `--n: ${n}` } }, ...flecken);
    const ende = el('div', { klasse: 'silben__ende' });
    const zurWiese = el(
      'button',
      {
        klasse: 'knopf knopf--icon silben__wiese',
        testid: 'silben-zur-wiese',
        attr: { 'aria-label': 'Andere Tiere', title: 'Andere Tiere' },
        beiKlick: () => {
          ctx.audio.stopp();
          void zeigeWiese().catch(melde);
        },
      },
      icon('medaillons', { groesse: 32, strich: 2 }),
    );

    platz.replaceChildren(
      el('div', { klasse: 'silben__buehne', attr: { style: `--n: ${n}` } }, huepfer, fleckenReihe, bogen),
      ende,
      elternzeile(ctx, 'Klatscht mit!') ?? '',
      zurWiese,
    );
    void spiele(ctx.audio.fest('aufforderung.klatschen'), melde);

    function springeAuf(i: number): void {
      huepfer.style.setProperty('--links', i < 0 ? '50%' : `${((i + 0.5) / n) * 100}%`);
      huepfe(tierKnopf);
    }

    function zeichneBogen(): void {
      const breite = 100;
      const pfade = flecken
        .map((f, i) => (f.dataset.gespielt === 'ja' ? `<path d="M ${i * breite + 12} 6 Q ${i * breite + breite / 2} 46 ${(i + 1) * breite - 12} 6" />` : ''))
        .join('');
      bogen.innerHTML = `<svg viewBox="0 0 ${n * breite} 50" preserveAspectRatio="none" focusable="false">${pfade}</svg>`;
    }
    zeichneBogen();

    /** Name, dann rhythmisch Silbe für Silbe; das Tier hüpft mit, markiert aber nichts. */
    function vormachen(): void {
      const schritte = silben.map((_, i) =>
        sicher(() => {
          springeAuf(i);
          return tierNr(ctx, t, 'silben', i);
        }, melde),
      );
      void ctx.audio.kette([sicher(() => sprichName(t), melde), () => ctx.audio.kette(schritte, SILBEN_TAKT_MS)], 700).then(() => {
        if (s.lebt && !fertig) springeAuf(naechste - 1);
      });
    }

    async function trommelUndSilbe(i: number): Promise<Ausgang | undefined> {
      const trommel = await ctx.audio.hatFest('geraeusch.trommel').catch((f: unknown) => {
        melde(f);
        return false;
      });
      const silbe = sicher(() => tierNr(ctx, t, 'silben', i), melde);
      return trommel ? ctx.audio.kette([sicher(() => ctx.audio.fest('geraeusch.trommel'), melde), silbe], 0) : silbe();
    }

    function tippeFleck(): void {
      if (fertig) neueRunde();
      const i = naechste;
      const fleck = flecken[i];
      if (!fleck) return;
      naechste++;
      fleck.dataset.gespielt = 'ja';
      springeAuf(i);
      zeichneBogen();
      const klang = trommelUndSilbe(i);
      if (naechste < n) return;
      const meine = runde;
      void hoechstens(s, klang, SILBE_FERTIG_FRIST_MS).then(() => {
        if (s.lebt && meine === runde) geschafft();
      });
    }

    function neueRunde(): void {
      runde++;
      fertig = false;
      naechste = 0;
      for (const f of flecken) f.dataset.gespielt = 'nein';
      zeichneBogen();
      ende.replaceChildren();
      huepfer.hidden = false;
    }

    function geschafft(): void {
      fertig = true;
      ctx.notizen.merke({ art: 'tier', wert: t.tier.name });
      huepfer.hidden = true;
      const freude = el(
        'button',
        {
          klasse: 'silben__freude',
          testid: 'silben-fertig',
          attr: { 'aria-label': `${t.tier.artikel} ${t.tier.name} – noch mal hören` },
          beiKlick: () => void spiele(sprichName(t), melde),
        },
        erzeugeFreude({ bildUrl, alt: `${t.tier.artikel} ${t.tier.name}` }),
      );
      ende.replaceChildren(
        freude,
        weiterKnopf('silben-weiter', 'Noch ein Tier', () => {
          ctx.audio.stopp();
          wiesenStart = (wiesenStart + 1) % liste.length;
          void zeigeWiese().catch(melde);
        }, 'medaillons'),
      );
      const freudeTon = (): Promise<Ausgang> =>
        tierTon(ctx, t, 'freude').then((a) => a ?? ctx.audio.fest('freude.allgemein'));
      void ctx.audio.kette([sicher(() => sprichName(t), melde), sicher(freudeTon, melde)]);
    }
  }

  await zeigeWiese();
}

export const modus: Modus = {
  id: 'silben',
  titel: 'Silben-Hüpfen',
  icon: 'silben',
  kacheln,
  begleitkarte:
    'Klatscht den Namen gemeinsam: ein Klatscher je Silbe, so wie man spricht. Es gibt keine falsche Reihenfolge — jeder Tipp bringt die nächste Silbe. Im Alltag geht das mit allem: „Ba-na-ne“, „Ze-bra-strei-fen“.',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
