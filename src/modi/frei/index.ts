/**
 * Freies Schreiben (Bau „schreiben“) — das bewegliche Alphabet auf dem Teppich.
 *
 * - data-testid="text" enthält exakt den geschriebenen Text (der Cursor liegt daneben).
 * - Jeder Buchstabe klingt (Laut bzw. Name je Einstellung), Leertaste liest das letzte Wort,
 *   „Vorlesen“ liest den ganzen Text. Frei Geschriebenes (auch Kauderwelsch) liest immer die
 *   eingestellte Live-Stimme (`audio.live`: Browser | Piper offline | OpenRouter, Konzept 6c).
 * - Spracheingabe (B8) nur, wenn Eltern sie hinter der Elternsperre eingeschaltet haben
 *   (`einstellungen.spracheingabe`): 'aus' = kein Knopf, 'browser' = Web Speech API,
 *   'openrouter' = Aufnahme über den AudioDienst → `audio.transkribiere`. Nie Richter über die
 *   Aussprache des Kindes: erkannter Text wird nur angehängt und vorgelesen.
 * - Passt das Wort am Ende des Texts zu einem Tier aus einem installierten Paket, kommt das
 *   Tier groß und freut sich (data-testid="tier-freude") — als Einblendung über dem Blatt,
 *   damit das Alphabet beim Tippen nicht verrutscht.
 * - Der Text bleibt erhalten, wenn das Kind den Modus verlässt (bis zum Neuladen der Seite).
 * - „Alles wegräumen“ (B5) nur per Halten (0,6 s, der Knopf füllt sich). Danach ein leises
 *   Wisch-Geräusch und ein freundlicher Satz (`wegraeumen.satz`). Einige Sekunden lang steht an
 *   derselben Stelle „zurückholen“, das mit `zurueckholen.satz` alles wiederbringt.
 */
import { anzeigeZeichen, artVon, istBuchstabe, schreibwort } from '../../kern/alphabet';
import { animiere, el } from '../../kern/dom';
import { mitHalten } from '../../kern/halten';
import { icon } from '../../kern/ui/icons';
import type { Ausgang, Buchstabe, Kontext, LaufendeAufnahme, Modus, Spracheingabe, TierTreffer } from '../../kern/vertrag';
import { erzeugeAlphabet } from '../../ui/alphabet';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeFreude, sprichFreude, tierBezeichnung } from '../tiere/freude';
import { erzeugeGucker } from '../laut-ruft-tier/gucker';
import './frei.css';

const MAX_ZEICHEN = 240;
const BESUCH_DAUER_MS = 5200;
/** So lange lässt sich „Alles wegräumen“ zurückholen. */
const ZURUECKHOLEN_MS = 10_000;
/** B5: so lange muss „Alles wegräumen“ gehalten werden. */
const WEGRAEUMEN_HALTEN_MS = 600;
/** Kurze Stille zwischen Geräusch und Satz beim Wegräumen/Zurückholen. */
const GERAEUSCH_PAUSE_MS = 250;

/** Text des Kindes über das Verlassen des Modus hinweg (Respekt vor dem Werk, versehentliches Zurück kostet nichts). */
let gemerkterText = '';

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

  let text = gemerkterText;
  /** Zuletzt weggeräumter Text, solange er sich zurückholen lässt. */
  let weggeraeumt: string | undefined;
  let zurueckholenNr = 0;
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

  // F2 „Laut ruft Tier“: nach dem Tastenlaut lugt ein Anlaut-Tier am Blattrand hervor.
  const gucker = erzeugeGucker({
    ctx,
    melde: (f) => meldung.melde(f),
    beiBesuch: (t) => void zeigeBesuch(t, schreibwort(t.tier.name), Promise.resolve(undefined)),
  });
  blatt.append(gucker.el);
  s.nachher(() => gucker.zerstoere());

  function zeichne(): void {
    gemerkterText = text;
    textEl.replaceChildren(
      ...Array.from(text).map((z) =>
        istBuchstabe(z) ? el('span', { klasse: artVon(z), text: anzeigeZeichen(z, gross) }) : document.createTextNode(z),
      ),
    );
    blatt.dataset.leer = text.length === 0 ? 'ja' : 'nein';
    vorlesenKnopf.disabled = text.trim().length === 0;
    const holen = weggeraeumt !== undefined && text.length === 0;
    leerenKnopf.hidden = holen;
    holKnopf.hidden = !holen;
    leerenKnopf.disabled = text.length === 0;
  }

  // --- Vorlesen -----------------------------------------------------------
  function lies(inhalt: string): Promise<Ausgang | undefined> {
    const t = inhalt.trim();
    if (!t) return Promise.resolve(undefined);
    // Frei Geschriebenes ist nie vorab vertont: immer die eingestellte Live-Stimme (6c).
    return spiele(ctx.audio.live(t), meldung.melde);
  }
  function letztesWort(): { wort: string; start: number } {
    const start = text.lastIndexOf(' ') + 1;
    return { wort: text.slice(start), start };
  }

  // --- Tier-Besuch --------------------------------------------------------
  function schliesseBesuch(): void {
    gucker.schliesse();
    besuchNr++;
    besuch.replaceChildren();
    besuch.dataset.offen = 'nein';
  }

  async function zeigeBesuch(treffer: TierTreffer, wort: string, nachLaut: Promise<Ausgang | undefined>): Promise<void> {
    gucker.schliesse();
    const nr = ++besuchNr;
    const bildUrl = await ctx.pakete.bildUrl(treffer.paket.id, treffer.tier.bild);
    if (!s.lebt || nr !== besuchNr) return;
    const name = tierBezeichnung(treffer);
    besuch.dataset.offen = 'ja';
    besuch.replaceChildren(
      el(
        'button',
        { klasse: 'frei__besuch-knopf', attr: { 'aria-label': `${name} freut sich – antippen zum Schließen` }, beiKlick: schliesseBesuch },
        erzeugeFreude({ bildUrl, alt: name, tier: treffer.tier }),
      ),
    );
    const aktuell = (): boolean => s.lebt && nr === besuchNr;
    void nachLaut.then((a) => {
      // abgebrochen: das Kind tippt schon weiter — dessen Laute nicht übertönen.
      if (a !== 'abgebrochen' && aktuell()) return sprichFreude(ctx, treffer, wort, aktuell, meldung.melde);
    });
    s.warte(BESUCH_DAUER_MS, () => {
      if (nr === besuchNr) schliesseBesuch();
    });
  }

  /** Prüft am Wortende des laufenden Texts, ob ein Tier gemeint ist. */
  function pruefeTier(nachLaut: Promise<Ausgang | undefined>): void {
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
  /** Sobald das Kind weiterschreibt, ist das Zurückholen vorbei. */
  function vergissWeggeraeumtes(): void {
    weggeraeumt = undefined;
    zurueckholenNr++;
  }

  function schreibe(b: Buchstabe): void {
    if (text.length >= MAX_ZEICHEN) {
      alphabet.wackle(b);
      return;
    }
    vergissWeggeraeumtes();
    text += b;
    zeichne();
    const laut = spiele(ctx.audio.buchstabe(b), meldung.melde);
    gucker.rufe(b, laut);
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
    vergissWeggeraeumtes();
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

  /** Geräusch + Satz als eine abbrechbare Kette (B5); Fehler (fehlende Datei) gehen sichtbar an die Meldung. */
  function sprichFest(geraeusch: () => Promise<Ausgang>, satz: string): void {
    void spiele(ctx.audio.kette([geraeusch, () => ctx.audio.fest(satz)], GERAEUSCH_PAUSE_MS), meldung.melde);
  }

  function wegraeumen(): void {
    if (!text) return;
    weggeraeumt = text;
    const nr = ++zurueckholenNr;
    text = '';
    gefeiert = '';
    holGedrueckt = false;
    schliesseBesuch();
    zeichne();
    sprichFest(() => ctx.audio.wisch(), 'wegraeumen.satz');
    s.warte(ZURUECKHOLEN_MS, () => {
      if (nr !== zurueckholenNr) return;
      weggeraeumt = undefined;
      zeichne();
    });
  }

  // Wegräumen nur per Halten (B5): ein kurzer Tipp wackelt nur, nichts geht verloren.
  const leerenKnopf = el(
    'button',
    { klasse: 'knopf knopf--icon knopf--gross frei__leeren', testid: 'text-leeren', attr: { 'aria-label': 'Alles wegräumen (gedrückt halten)' } },
    icon('loeschen', { groesse: 26 }),
  );
  s.nachher(
    mitHalten(leerenKnopf, {
      ms: WEGRAEUMEN_HALTEN_MS,
      beiHalten: wegraeumen,
      beiKurz: () => animiere(leerenKnopf, 'wackelt'),
    }),
  );
  // Nach dem Wegräumen steht an derselben Stelle „zurückholen“: ein Tipp bringt alles wieder.
  const holKnopf = el(
    'button',
    {
      klasse: 'knopf knopf--icon knopf--gross frei__holen',
      testid: 'text-zurueckholen',
      attr: { 'aria-label': 'Text zurückholen', hidden: true },
      beiKlick: (ev) => {
        if (weggeraeumt === undefined) return;
        // Der Finger, der gerade weggeräumt hat, liegt noch genau hier: sein Loslassen holt nicht gleich zurück.
        // Erst ein neuer Druck auf diesen Knopf (oder die Tastatur, detail 0) zählt.
        if (ev.detail !== 0 && !holGedrueckt) return;
        holGedrueckt = false;
        text = weggeraeumt;
        vergissWeggeraeumtes();
        zeichne();
        sprichFest(() => ctx.audio.fest('geraeusch.zurueck'), 'zurueckholen.satz');
      },
    },
    icon('nochmal', { groesse: 26 }),
  );
  let holGedrueckt = false;
  holKnopf.addEventListener('pointerdown', () => {
    holGedrueckt = true;
  });
  const mikroPlatz = el('span', { klasse: 'frei__mikroplatz' });
  const knoepfe = el('div', { klasse: 'frei__knoepfe' }, leerenKnopf, holKnopf, vorlesenKnopf, mikroPlatz);

  // --- Spracheingabe (B8) -------------------------------------------------
  /** Erkannten Text anhängen und vorlesen — nie bewerten. */
  function haengeAn(roh: string): void {
    const neu = normiereGesprochenes(roh);
    if (!neu || !s.lebt) return;
    vergissWeggeraeumtes();
    const trenner = text.length > 0 && !text.endsWith(' ') ? ' ' : '';
    text = (text + trenner + neu).slice(0, MAX_ZEICHEN);
    zeichne();
    const vorgelesen = lies(neu);
    pruefeTier(vorgelesen);
  }

  /** Laufende Spracheingabe abbrechen (beim Umschalten und beim Verlassen). */
  let beendeSpracheingabe: () => void = () => {};
  let quelle: Spracheingabe = 'aus';

  function baueMikro(neu: Spracheingabe): void {
    if (neu === quelle) return;
    beendeSpracheingabe();
    beendeSpracheingabe = () => {};
    quelle = neu;
    mikroPlatz.replaceChildren();
    if (neu === 'aus') return;

    const mikro = el(
      'button',
      {
        klasse: 'knopf knopf--icon knopf--gross frei__mikro',
        testid: 'spracheingabe',
        attr: { 'aria-label': 'Sprechen statt tippen', 'aria-pressed': 'false', 'data-quelle': neu },
      },
      icon('mikrofon', { groesse: 30 }),
    );
    const zeigeLaufend = (an: boolean): void => mikro.setAttribute('aria-pressed', String(an));
    mikroPlatz.append(mikro);

    if (neu === 'browser') {
      let laufend: Spracherkennung | undefined;
      beendeSpracheingabe = () => laufend?.abort();
      mikro.addEventListener('click', () => {
        if (laufend) {
          laufend.abort();
          return;
        }
        const Erkennung = spracherkennungKonstruktor();
        if (!Erkennung) {
          meldung.melde(new Error('Dieser Browser kann keine Spracheingabe. In den Einstellungen „OpenRouter“ wählen oder die Spracheingabe ausschalten.'));
          return;
        }
        const e = new Erkennung();
        e.lang = 'de-DE';
        e.interimResults = false;
        e.continuous = false;
        e.maxAlternatives = 1;
        e.onresult = (ev) => haengeAn(ev.results[0]?.[0]?.transcript ?? '');
        e.onerror = (ev) => {
          if (ev.error === 'aborted' || ev.error === 'no-speech') return; // selbst abgebrochen bzw. still geblieben
          meldung.melde(new Error(ERKENNUNGS_MELDUNGEN[ev.error] ?? `Spracheingabe gestört (${ev.error}).`));
        };
        e.onend = () => {
          laufend = undefined;
          zeigeLaufend(false);
        };
        ctx.audio.stopp();
        e.start();
        laufend = e;
        zeigeLaufend(true);
      });
      return;
    }

    // 'openrouter': erster Tipp nimmt auf, zweiter Tipp schickt die Aufnahme zur Transkription.
    let aufnahme: LaufendeAufnahme | undefined;
    let startet = false;
    let gilt = 0;
    beendeSpracheingabe = () => {
      gilt++;
      aufnahme?.abbrechen();
      aufnahme = undefined;
      zeigeLaufend(false);
    };
    mikro.addEventListener('click', () => {
      if (startet) return;
      if (aufnahme) {
        const a = aufnahme;
        aufnahme = undefined;
        zeigeLaufend(false);
        const nr = gilt;
        mikro.dataset.zustand = 'hoert';
        a.stoppe()
          .then((blob) => ctx.audio.transkribiere(blob))
          .then((t) => {
            if (nr === gilt) haengeAn(t);
          })
          .catch(meldung.melde)
          .finally(() => delete mikro.dataset.zustand);
        return;
      }
      startet = true;
      const nr = gilt;
      ctx.audio
        .aufnahmeStarten()
        .then((a) => {
          if (nr !== gilt || !s.lebt) {
            a.abbrechen();
            return;
          }
          aufnahme = a;
          zeigeLaufend(true);
        })
        .catch(meldung.melde)
        .finally(() => {
          startet = false;
        });
    });
  }
  baueMikro(ctx.einstellungen.lese().spracheingabe);
  s.nachher(() => beendeSpracheingabe());

  // --- Einstellungen ------------------------------------------------------
  s.nachher(
    ctx.einstellungen.abonniere((e) => {
      baueMikro(e.spracheingabe);
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
