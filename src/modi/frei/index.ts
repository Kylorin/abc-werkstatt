/**
 * Freies Schreiben (Bau „schreiben") — das bewegliche Alphabet auf dem Teppich.
 *
 * - data-testid="text" enthält exakt den geschriebenen Text (der Cursor liegt daneben).
 * - Jeder Buchstabe klingt (Laut bzw. Name je Einstellung), Leertaste liest das letzte Wort,
 *   „Vorlesen" liest den ganzen Text.
 * - Spracheingabe (Web Speech API): Ergebnis anhängen und vorlesen; ohne API kein Knopf.
 * - Passt das Wort am Ende des Texts zu einem Tier aus einem installierten Paket, kommt das
 *   Tier groß und freut sich (data-testid="tier-freude").
 */
import { anzeigeZeichen, artVon, istBuchstabe, schreibwort } from '../../kern/alphabet';
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Buchstabe, Kontext, Modus, TierTreffer } from '../../kern/vertrag';
import { erzeugeAlphabet } from '../../ui/alphabet';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeFreude, sprichFreude, tierBezeichnung } from '../tiere/freude';
import './frei.css';

const MAX_ZEICHEN = 240;
const BESUCH_DAUER_MS = 5200;

// ---------------------------------------------------------------------------
// Web Speech API (nicht in allen lib.dom-Ständen typisiert → minimale eigene Typen)
// ---------------------------------------------------------------------------

interface ErkennungsErgebnis {
  readonly results: ArrayLike<ArrayLike<{ readonly transcript: string }>>;
}
interface ErkennungsFehler {
  readonly error: string;
}
interface Spracherkennung {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((ev: ErkennungsErgebnis) => void) | null;
  onerror: ((ev: ErkennungsFehler) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type SpracherkennungKonstruktor = new () => Spracherkennung;

function spracherkennungKonstruktor(): SpracherkennungKonstruktor | undefined {
  const w = window as unknown as { SpeechRecognition?: SpracherkennungKonstruktor; webkitSpeechRecognition?: SpracherkennungKonstruktor };
  // Zwei Namen derselben API (Standard und WebKit-Präfix), kein inhaltlicher Ersatzweg.
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

const ERKENNUNGS_MELDUNGEN: Record<string, string> = {
  'not-allowed': 'Das Mikrofon ist nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.',
  'service-not-allowed': 'Die Spracheingabe ist in diesem Browser nicht erlaubt.',
  'audio-capture': 'Es wurde kein Mikrofon gefunden.',
  network: 'Die Spracheingabe braucht gerade eine Internetverbindung.',
};

/** Erkannte Sprache → nur Buchstaben aus dem Alphabet und einzelne Leerzeichen. */
export function normiereGesprochenes(text: string): string {
  return Array.from(schreibwort(text))
    .map((z) => (istBuchstabe(z) ? z : /\s/.test(z) ? ' ' : ''))
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------

let sitzung: Sitzung | undefined;

function mount(flaeche: HTMLElement, ctx: Kontext): void {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;

  let text = '';
  let gross = ctx.einstellungen.lese().grossbuchstaben;
  /** Schlüssel des zuletzt gefeierten Worts (Position + Wort), damit dasselbe Wort nicht doppelt feiert. */
  let gefeiert = '';
  let besuchNr = 0;

  const meldung = erzeugeMeldung();

  // --- Schreibblatt -------------------------------------------------------
  const textEl = el('p', { klasse: 'frei__text', testid: 'text', attr: { 'aria-live': 'polite', 'aria-label': 'Geschriebener Text' } });
  const cursor = el('span', { klasse: 'frei__cursor', attr: { 'aria-hidden': 'true' } });
  const blatt = el('div', { klasse: 'frei__blatt' }, el('div', { klasse: 'frei__zeile' }, textEl, cursor));
  const besuch = el('div', { klasse: 'frei__besuch', attr: { 'aria-live': 'polite' } });

  function zeichne(): void {
    textEl.replaceChildren(
      ...Array.from(text).map((z) =>
        istBuchstabe(z) ? el('span', { klasse: artVon(z), text: anzeigeZeichen(z, gross) }) : document.createTextNode(z),
      ),
    );
    blatt.dataset.leer = text.length === 0 ? 'ja' : 'nein';
    vorlesenKnopf.disabled = text.trim().length === 0;
    leerenKnopf.disabled = text.length === 0;
  }

  // --- Vorlesen -----------------------------------------------------------
  function lies(inhalt: string): Promise<void> {
    const t = inhalt.trim();
    if (!t) return Promise.resolve();
    const p = t.includes(' ') ? ctx.audio.satz(t) : ctx.audio.wort(t);
    return spiele(p, meldung.melde);
  }
  function letztesWort(): { wort: string; start: number } {
    const start = text.lastIndexOf(' ') + 1;
    return { wort: text.slice(start), start };
  }

  // --- Tier-Besuch --------------------------------------------------------
  function schliesseBesuch(): void {
    besuchNr++;
    besuch.replaceChildren();
    besuch.dataset.offen = 'nein';
  }

  async function zeigeBesuch(treffer: TierTreffer, wort: string, nachLaut: Promise<void>): Promise<void> {
    const nr = ++besuchNr;
    const bildUrl = await ctx.pakete.bildUrl(treffer.paket.id, treffer.tier.bild);
    if (!s.lebt || nr !== besuchNr) return;
    const name = tierBezeichnung(treffer);
    besuch.dataset.offen = 'ja';
    besuch.replaceChildren(
      el(
        'button',
        { klasse: 'frei__besuch-knopf', attr: { 'aria-label': `${name} freut sich – antippen zum Schließen` }, beiKlick: schliesseBesuch },
        erzeugeFreude({ bildUrl, alt: name }),
      ),
    );
    const aktuell = (): boolean => s.lebt && nr === besuchNr;
    void nachLaut.then(() => {
      if (aktuell()) return sprichFreude(ctx, treffer, wort, aktuell, meldung.melde);
    });
    s.warte(BESUCH_DAUER_MS, () => {
      if (nr === besuchNr) schliesseBesuch();
    });
  }

  /** Prüft am Wortende des laufenden Texts, ob ein Tier gemeint ist. */
  function pruefeTier(nachLaut: Promise<void>): void {
    const { wort, start } = letztesWort();
    if (wort.length < 2) return;
    const schluessel = `${start}:${wort}`;
    if (schluessel === gefeiert) return;
    const stand = text;
    ctx.pakete
      .findeTier(schreibwort(wort))
      .then((treffer) => {
        if (!treffer || !s.lebt || text !== stand) return;
        gefeiert = schluessel;
        return zeigeBesuch(treffer, schreibwort(wort), nachLaut);
      })
      .catch(meldung.melde);
  }

  // --- Eingaben -----------------------------------------------------------
  function schreibe(b: Buchstabe): void {
    if (text.length >= MAX_ZEICHEN) {
      alphabet.wackle(b);
      return;
    }
    text += b;
    zeichne();
    const laut = spiele(ctx.audio.buchstabe(b), meldung.melde);
    pruefeTier(laut);
  }

  function loesche(): void {
    if (!text) return;
    text = Array.from(text).slice(0, -1).join('');
    gefeiert = ''; // nach einer Korrektur darf dasselbe Tier wiederkommen
    zeichne();
  }

  function leertaste(): void {
    const { wort } = letztesWort();
    if (text.length > 0 && !text.endsWith(' ') && text.length < MAX_ZEICHEN) {
      text += ' ';
      zeichne();
    }
    void lies(wort);
  }

  const alphabet = erzeugeAlphabet({
    grossbuchstaben: gross,
    beiTaste: schreibe,
    beiLoeschen: loesche,
    beiLeertaste: leertaste,
  });
  s.nachher(() => alphabet.zerstoere());

  // --- Knöpfe -------------------------------------------------------------
  const vorlesenKnopf = el(
    'button',
    { klasse: 'knopf knopf--gross frei__vorlesen', testid: 'vorlesen', attr: { 'aria-label': 'Vorlesen' }, beiKlick: () => void lies(text) },
    icon('lautsprecher', { groesse: 30 }),
    el('span', { klasse: 'frei__knopftext', text: 'Vorlesen' }),
  );
  const leerenKnopf = el(
    'button',
    {
      klasse: 'knopf knopf--icon knopf--leise',
      testid: 'text-leeren',
      attr: { 'aria-label': 'Alles wegräumen' },
      beiKlick: () => {
        text = '';
        gefeiert = '';
        schliesseBesuch();
        zeichne();
      },
    },
    icon('loeschen', { groesse: 26 }),
  );
  const knoepfe = el('div', { klasse: 'frei__knoepfe' }, leerenKnopf, vorlesenKnopf);

  // --- Spracheingabe ------------------------------------------------------
  const Erkennung = spracherkennungKonstruktor();
  if (Erkennung) {
    let laufend: Spracherkennung | undefined;
    const mikro = el(
      'button',
      {
        klasse: 'knopf knopf--icon knopf--gross frei__mikro',
        testid: 'spracheingabe',
        attr: { 'aria-label': 'Sprechen statt tippen', 'aria-pressed': 'false' },
        beiKlick: () => {
          if (laufend) {
            laufend.abort();
            return;
          }
          const e = new Erkennung();
          e.lang = 'de-DE';
          e.interimResults = false;
          e.continuous = false;
          e.maxAlternatives = 1;
          e.onresult = (ev) => {
            const roh = ev.results[0]?.[0]?.transcript ?? '';
            const neu = normiereGesprochenes(roh);
            if (!neu || !s.lebt) return;
            const trenner = text.length > 0 && !text.endsWith(' ') ? ' ' : '';
            text = (text + trenner + neu).slice(0, MAX_ZEICHEN);
            zeichne();
            const vorgelesen = lies(neu);
            pruefeTier(vorgelesen);
          };
          e.onerror = (ev) => {
            if (ev.error === 'aborted' || ev.error === 'no-speech') return; // selbst abgebrochen bzw. still geblieben
            meldung.melde(new Error(ERKENNUNGS_MELDUNGEN[ev.error] ?? `Spracheingabe gestört (${ev.error}).`));
          };
          e.onend = () => {
            laufend = undefined;
            mikro.setAttribute('aria-pressed', 'false');
          };
          ctx.audio.stopp();
          e.start();
          laufend = e;
          mikro.setAttribute('aria-pressed', 'true');
        },
      },
      icon('mikrofon', { groesse: 30 }),
    );
    s.nachher(() => laufend?.abort());
    knoepfe.append(mikro);
  }

  // --- Einstellungen ------------------------------------------------------
  s.nachher(
    ctx.einstellungen.abonniere((e) => {
      if (e.grossbuchstaben === gross) return;
      gross = e.grossbuchstaben;
      alphabet.setzeGross(gross);
      zeichne();
    }),
  );

  flaeche.classList.add('flaeche--frei');
  s.nachher(() => flaeche.classList.remove('flaeche--frei'));
  flaeche.append(besuch, blatt, knoepfe, alphabet.el, meldung.el);
  schliesseBesuch();
  zeichne();
}

export const modus: Modus = {
  id: 'frei',
  titel: 'Freies Schreiben',
  icon: 'frei',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
