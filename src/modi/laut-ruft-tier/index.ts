/**
 * Laut ruft Tier — Regal-Variante für Stufe B (F2): Freies Schreiben mit KLEINEM Kasten.
 *
 * - Nur 4–6 große Tasten (`kastenBuchstaben`, leer = automatisch: Anfangsbuchstabe des Kindes,
 *   dann Laute mit Tieren im Paket, gut unterscheidbar gewählt), plus Löschtaste.
 * - Jede Taste klingt sofort mit ihrem Laut; danach lugt ein Tier mit genau diesem Anlaut hervor
 *   (Gucker, siehe gucker.ts). Antippen holt es groß heraus, es sagt seinen „kann“-Satz.
 * - Ergibt das Geschriebene einen Tiernamen, kommt das Tier ganz heraus und freut sich.
 * - Kauderwelsch: nach 2 s Tipp-Pause wird das letzte Wort lautiert und zusammengezogen gelesen (live).
 *   Die Pause zählt erst, wenn der Ruf des Guckers verklungen ist; kommt ein Tier heraus, entfällt das
 *   Vorlesen (es läuft immer nur eine Tonquelle — der Tier-Ruf und die Freude haben Vorrang).
 * - Keine Sackgasse: Der Kasten hält höchstens MAX_ZEICHEN Zeichen. Ist er voll, rutscht das Älteste
 *   vorne heraus, und jede Taste klingt und ruft weiter wie immer.
 * Testvertrag: `kleiner-kasten`, `taste-<b>`, `text`, `anlaut-gucker`, `tier-freude`.
 */
import { anzeigeZeichen, artVon, buchstabenVon, istBuchstabe, schreibwort } from '../../kern/alphabet';
import { el } from '../../kern/dom';
import type { AnlautTreffer, Ausgang, Buchstabe, Kontext, Modus, TierTreffer } from '../../kern/vertrag';
import { ANLAUT_LAUTE } from '../../kern/vertrag';
import { kontrastiert, tiereMitAnlaut } from '../../paket/anlaut';
import { erzeugeAlphabet } from '../../ui/alphabet';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeFreude, sprichFreude, sprichKann, tierBezeichnung } from '../tiere/freude';
import { erzeugeGucker } from './gucker';
import './laut-ruft-tier.css';

const KASTEN_MIN = 4;
const KASTEN_MAX = 6;
const MAX_ZEICHEN = 24;
/** Tipp-Pause, nach der das letzte Wort vorgelesen wird (Kauderwelsch, F2). */
const VORLESE_PAUSE_MS = 2000;
const BESUCH_MS = 5200;
/** Häufige, gut unterscheidbare erste Buchstaben, falls das Paket zu wenige Anlaut-Laute hat. */
const GRUNDVORRAT: readonly Buchstabe[] = ['m', 'a', 's', 'i', 'o', 't', 'l', 'u', 'r', 'e'];

/**
 * Tasten des kleinen Kastens: Papas Wahl (`kastenBuchstaben`) plus Anfangsbuchstabe des Kindes;
 * leer = automatisch aus den Anlauten der Pakete, kontrastierend, aufgefüllt aus dem Grundvorrat.
 */
export function kastenTasten(gewaehlt: readonly Buchstabe[], kindAnfang: Buchstabe | undefined, paketLaute: readonly Buchstabe[]): Buchstabe[] {
  const aus: Buchstabe[] = [];
  const nimm = (b: Buchstabe, nurKontrast: boolean): void => {
    if (aus.length >= KASTEN_MAX || aus.includes(b)) return;
    if (nurKontrast && aus.some((a) => !kontrastiert(a, b))) return;
    aus.push(b);
  };
  if (kindAnfang) nimm(kindAnfang, false);
  if (gewaehlt.length > 0) {
    for (const b of gewaehlt) nimm(b, false);
  } else {
    for (const b of paketLaute) nimm(b, true);
    for (const b of GRUNDVORRAT) if (aus.length < KASTEN_MIN) nimm(b, true);
  }
  return ANLAUT_LAUTE.filter((b) => aus.includes(b)).concat(aus.filter((b) => !ANLAUT_LAUTE.includes(b)));
}

let sitzung: Sitzung | undefined;

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;
  const meldung = erzeugeMeldung();

  const e = ctx.einstellungen.lese();
  const anlaute = tiereMitAnlaut(await ctx.pakete.liste());
  if (!s.lebt) return;
  const tasten = kastenTasten(e.kastenBuchstaben, e.kindAnfang, [...anlaute.keys()]);
  let gross = e.grossbuchstaben;
  let text = '';
  let vorleseTimer: number | undefined;
  /** Zählt geplante Vorlesungen; ein Tier-Besuch oder ein neuer Tipp macht ältere ungültig. */
  let vorleseNr = 0;
  let besuchNr = 0;

  const textEl = el('p', { klasse: 'lrt__text', testid: 'text', attr: { 'aria-live': 'polite', 'aria-label': 'Geschriebener Text' } });
  const blatt = el('div', { klasse: 'lrt__blatt' }, textEl);
  const besuch = el('div', { klasse: 'lrt__besuch', attr: { 'data-offen': 'nein' } });

  function zeichne(): void {
    textEl.replaceChildren(...Array.from(text).map((z) => (istBuchstabe(z) ? el('span', { klasse: artVon(z), text: anzeigeZeichen(z, gross) }) : document.createTextNode(z))));
    blatt.dataset.leer = text ? 'nein' : 'ja';
  }

  function schliesseBesuch(): void {
    besuchNr++;
    besuch.dataset.offen = 'nein';
    besuch.replaceChildren();
  }

  /** Ein Tier kommt groß heraus: vom Gucker (sagt „kann“) oder weil sein Name geschrieben wurde (freut sich). */
  async function zeigeBesuch(treffer: TierTreffer, art: 'gucker' | 'geschrieben', nachLaut?: Promise<Ausgang | undefined>): Promise<void> {
    const nr = ++besuchNr;
    // Das Tier spricht: das Kauderwelsch-Vorlesen darf es nicht abschneiden.
    stoppeVorlesen();
    const url = await ctx.pakete.bildUrl(treffer.paket.id, treffer.tier.bild);
    if (!s.lebt || nr !== besuchNr) return;
    const name = tierBezeichnung(treffer);
    besuch.replaceChildren(
      el('button', { klasse: 'lrt__besuch-knopf', attr: { 'aria-label': `${name} – antippen zum Schließen` }, beiKlick: schliesseBesuch }, erzeugeFreude({ bildUrl: url, alt: name, tier: treffer.tier })),
    );
    besuch.dataset.offen = 'ja';
    const aktuell = (): boolean => s.lebt && nr === besuchNr;
    if (art === 'gucker') sprichKann(ctx, treffer).catch(meldung.melde);
    else
      void (nachLaut ?? Promise.resolve(undefined)).then((a) => {
        if (a !== 'abgebrochen' && aktuell()) return sprichFreude(ctx, treffer, schreibwort(treffer.tier.name), aktuell, meldung.melde);
      });
    s.warte(BESUCH_MS, () => {
      if (nr === besuchNr) schliesseBesuch();
    });
  }

  const gucker = erzeugeGucker({
    ctx,
    melde: meldung.melde,
    beiBesuch: (t: AnlautTreffer) => void zeigeBesuch(t, 'gucker').catch(meldung.melde),
  });
  s.nachher(() => gucker.zerstoere());
  blatt.append(gucker.el);

  /** Lautierend, dann zusammengezogen (Kauderwelsch ist erlaubt). Jeder neue Tipp bricht ab. */
  async function lies(wort: string): Promise<void> {
    const bs = buchstabenVon(wort);
    for (const b of bs) if ((await spiele(ctx.audio.laut(b), meldung.melde)) === 'abgebrochen') return;
    await spiele(ctx.audio.wort(wort), meldung.melde);
  }

  function stoppeVorlesen(): void {
    vorleseNr++;
    if (vorleseTimer !== undefined) window.clearTimeout(vorleseTimer);
    vorleseTimer = undefined;
  }

  /** Vorlesen nach VORLESE_PAUSE_MS Stille — gezählt erst, wenn der Ruf des Guckers (`nachRuf`) vorbei ist. */
  function planeVorlesen(nachRuf: Promise<unknown>): void {
    stoppeVorlesen();
    const nr = vorleseNr;
    void nachRuf.then(() => {
      if (!s.lebt || nr !== vorleseNr) return;
      vorleseTimer = window.setTimeout(() => {
        vorleseTimer = undefined;
        if (!s.lebt || nr !== vorleseNr) return;
        const wort = text.split(' ').pop() ?? '';
        if (Array.from(wort).length >= 2) void lies(wort);
      }, VORLESE_PAUSE_MS);
    });
  }
  s.nachher(stoppeVorlesen);

  /** Kasten voll: vorne so viel herausrutschen lassen, dass `platz` Zeichen dazupassen (nie eine Sackgasse). */
  function machePlatz(platz: number): void {
    const z = Array.from(text);
    if (z.length + platz <= MAX_ZEICHEN) return;
    text = z
      .slice(z.length + platz - MAX_ZEICHEN)
      .join('')
      .replace(/^ +/, '');
  }

  function schreibe(b: Buchstabe): void {
    machePlatz(1);
    text += b;
    zeichne();
    schliesseBesuch();
    const laut = spiele(ctx.audio.buchstabe(b), meldung.melde);
    const ruf = gucker.rufe(b, laut);
    ctx.notizen.merke({ art: 'laut', wert: b });
    planeVorlesen(ruf);
    const wort = text.split(' ').pop() ?? '';
    if (Array.from(wort).length >= 2) {
      const stand = text;
      ctx.pakete
        .findeTier(wort)
        .then((t) => {
          if (!t || !s.lebt || text !== stand) return;
          gucker.schliesse();
          return zeigeBesuch(t, 'geschrieben', laut);
        })
        .catch(meldung.melde);
    }
  }

  const alphabet = erzeugeAlphabet({
    grossbuchstaben: gross,
    buchstaben: tasten,
    gross: true,
    beiTaste: schreibe,
    beiLoeschen: () => {
      if (!text) return;
      stoppeVorlesen();
      text = Array.from(text).slice(0, -1).join('');
      zeichne();
    },
    beiLeertaste: () => {
      if (text && !text.endsWith(' ')) {
        machePlatz(1);
        if (!text) return;
        text += ' ';
        zeichne();
      }
    },
  });
  s.nachher(() => alphabet.zerstoere());
  s.nachher(
    ctx.einstellungen.abonniere((neu) => {
      if (neu.grossbuchstaben === gross) return;
      gross = neu.grossbuchstaben;
      alphabet.setzeGross(gross);
      zeichne();
    }),
  );

  flaeche.classList.add('flaeche--lrt');
  s.nachher(() => flaeche.classList.remove('flaeche--lrt'));
  flaeche.append(besuch, blatt, el('div', { klasse: 'lrt__kasten', testid: 'kleiner-kasten' }, alphabet.el), meldung.el);
  schliesseBesuch();
  zeichne();
}

export const modus: Modus = {
  id: 'laut-ruft-tier',
  titel: 'Laut ruft Tier',
  icon: 'lautruf',
  begleitkarte:
    'Jeder Buchstabe ruft ein Tier, das genau so anfängt. Fragen Sie: „Welcher Buchstabe holt den Igel?“ und machen Sie den Laut vor. Im Alltag: „Ich höre was, das fängt mit mmm an …“',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
