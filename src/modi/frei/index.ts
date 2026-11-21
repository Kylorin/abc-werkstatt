/**
 * Freies Schreiben (Bau „schreiben“) — das bewegliche Alphabet auf dem Teppich.
 *
 * - data-testid="text" enthält exakt den geschriebenen Text (der Cursor liegt daneben).
 * - Jeder Buchstabe klingt (Laut bzw. Name je Einstellung), Leertaste liest das letzte Wort,
 *   „Vorlesen“ liest den ganzen Text. Frei Geschriebenes (auch Kauderwelsch) liest immer die
 *   eingestellte Live-Stimme (`audio.live`: Browser | Piper offline | OpenRouter, Konzept 6c).
 * - Spracheingabe (B8) nur, wenn Eltern sie hinter der Elternsperre eingeschaltet haben
 *   (`einstellungen.spracheingabe`): 'aus' = kein Knopf, 'browser' = Web Speech API,
 *   'openrouter' = Aufnahme → `audio.transkribiere` (src/audio/spracheingabe.ts, höchstens 8 s).
 *   In der installierten App startet der Knopf nur nach Halten (Elternsperre). Nie Richter über
 *   die Aussprache des Kindes: erkannter Text wird nur angehängt und vorgelesen.
 * - Passt das Wort am Ende des Texts zu einem Tier aus einem installierten Paket, kommt das
 *   Tier groß und freut sich (data-testid="tier-freude") — als Einblendung über dem Blatt,
 *   damit das Alphabet beim Tippen nicht verrutscht.
 * - Der Text bleibt erhalten, wenn das Kind den Modus verlässt (bis zum Neuladen der Seite).
 * - „Alles wegräumen“ (B5) nur per Halten (0,6 s, der Knopf füllt sich). Danach ein leises
 *   Wisch-Geräusch und ein freundlicher Satz (`wegraeumen.satz`). Einige Sekunden lang steht an
 *   derselben Stelle „zurückholen“, das mit `zurueckholen.satz` alles wiederbringt.
 */
import { anzeigeZeichen, artVon, istBuchstabe, schreibwort } from '../../kern/alphabet';
import { animiere, el, passeSchriftAn } from '../../kern/dom';
import { mitHalten } from '../../kern/halten';
import { icon } from '../../kern/ui/icons';
import type { Ausgang, Buchstabe, Einstellungen, Kontext, Modus, TierTreffer } from '../../kern/vertrag';
import { erzeugeSperrHinweis, mitElternsperre, sperreAktiv } from '../../kern/elternsperre';
import { spracheingabeMoeglich, starteSpracheingabe, type SpracheingabeLauf } from '../../audio/spracheingabe';
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
  const zeile = el('div', { klasse: 'frei__zeile' }, textEl, cursor);
  const blatt = el('div', { klasse: 'frei__blatt' }, zeile);
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
    // Wörter brechen nie mitten im Wort um: zu lange werden kleiner; passt es auch dann nicht
    // (Querformat, feste Blatthöhe), bleibt das Neueste sichtbar.
    const quer = window.matchMedia('(orientation: landscape) and (max-height: 600px)').matches;
    if (!passeSchriftAn({ wurzel: blatt, text: textEl, mess: zeile, minPx: 24, auchHoehe: quer })) zeile.scrollTop = zeile.scrollHeight;
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
    void gucker.rufe(b, laut);
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
  let mikroStand = '';

  /**
   * Mikrofon-Knopf nach Einstellung. B8: Spracheingabe ist für Eltern — in der installierten App
   * (Elternsperre aktiv) startet sie nur nach 2 s Halten wie der Elternbereich; ein Patschtipp
   * zeigt nur den Hinweis. Ein Lauf dauert höchstens SPRACHEINGABE_MAX_MS (dann wird automatisch
   * aufgeschrieben, src/audio/spracheingabe.ts). Antippen während des Laufs beendet das Zuhören.
   */
  function baueMikro(e: Einstellungen): void {
    const gesperrt = sperreAktiv(ctx.einstellungen);
    const moeglich = spracheingabeMoeglich(e);
    const stand = `${e.spracheingabe}|${moeglich}|${gesperrt}`;
    if (stand === mikroStand) return;
    mikroStand = stand;
    beendeSpracheingabe();
    beendeSpracheingabe = () => {};
    mikroPlatz.replaceChildren();
    if (e.spracheingabe === 'aus' || !moeglich) return;

    const mikro = el(
      'button',
      {
        klasse: 'knopf knopf--icon knopf--gross frei__mikro',
        testid: 'spracheingabe',
        attr: { 'aria-label': 'Sprechen statt tippen (für Eltern)', 'aria-pressed': 'false', 'data-quelle': e.spracheingabe },
      },
      icon('mikrofon', { groesse: 30 }),
    );
    const hinweis = erzeugeSperrHinweis();
    mikroPlatz.append(mikro, hinweis);

    let lauf: SpracheingabeLauf | undefined;
    let startet = false;
    let gilt = 0;
    const zeige = (z: 'hoert' | 'schreibt' | undefined): void => {
      mikro.setAttribute('aria-pressed', String(z === 'hoert'));
      if (z) mikro.dataset.zustand = z;
      else delete mikro.dataset.zustand;
    };
    beendeSpracheingabe = () => {
      gilt++;
      lauf?.abbrechen();
      lauf = undefined;
      zeige(undefined);
    };
    const starte = (): void => {
      if (startet) return;
      if (lauf) {
        lauf.fertig();
        return;
      }
      startet = true;
      const nr = ++gilt;
      starteSpracheingabe(ctx.audio, ctx.einstellungen.lese(), {
        beiText: (t) => {
          if (nr === gilt) haengeAn(t);
        },
        beiFehler: (f) => {
          if (nr === gilt) meldung.melde(f);
        },
        beiEnde: () => {
          if (nr !== gilt) return;
          lauf = undefined;
          zeige(undefined);
        },
        beiZustand: (z) => {
          if (nr === gilt) zeige(z);
        },
      })
        .then((l) => {
          // Inzwischen verlassen oder umgeschaltet: Mikrofon sofort wieder zu, nichts verschicken.
          if (nr !== gilt || !s.lebt) l.abbrechen();
          else lauf = l;
        })
        .catch((f: unknown) => {
          if (nr === gilt) meldung.melde(f);
        })
        .finally(() => {
          startet = false;
        });
    };
    if (gesperrt) mitElternsperre(mikro, hinweis, starte);
    else mikro.addEventListener('click', starte);
  }
  baueMikro(ctx.einstellungen.lese());
  s.nachher(() => beendeSpracheingabe());

  // --- Einstellungen ------------------------------------------------------
  s.nachher(
    ctx.einstellungen.abonniere((e) => {
      baueMikro(e);
      if (e.grossbuchstaben === gross) return;
      gross = e.grossbuchstaben;
      alphabet.setzeGross(gross);
      zeichne();
    }),
  );

  flaeche.classList.add('flaeche--frei');
  s.nachher(() => flaeche.classList.remove('flaeche--frei'));
  flaeche.append(besuch, blatt, knoepfe, alphabet.el, meldung.el);
  const neuEinpassen = (): void => zeichne();
  window.addEventListener('resize', neuEinpassen);
  s.nachher(() => window.removeEventListener('resize', neuEinpassen));
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
