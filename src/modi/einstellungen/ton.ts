/**
 * Elternbereich „Stimme und Spracheingabe“ (B8/B14/B18, Bau „audio-live“).
 * - Live-Stimme für frei Geschriebenes: Gerät | Offline-Stimme (Piper, einmal herunterladen) | OpenRouter.
 * - Spracheingabe: aus | Browser | OpenRouter — nur hier hinter der Elternsperre einschaltbar.
 * - Eigener OpenRouter-Schlüssel (bleibt auf dem Gerät), Hinweise zu Kosten und Datenfluss.
 * - Bildlicher Hinweis auf den Stummschalter (B14).
 * Feste Sätze, Laute und Tierstimmen kommen immer aus Dateien — nie live.
 */
import { el, fehlerHinweis } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Einstellungen, Kontext, LiveStimme, Spracheingabe } from '../../kern/vertrag';
import { PIPER_MB, piperEntfernen, piperFortschritt, piperLaden, piperStand, type PiperStand } from '../../audio/piper';
import { spracheingabeHinderungsgrund, starteSpracheingabe, type SpracheingabeLauf } from '../../audio/spracheingabe';
import { stummHinweis } from '../../audio/stummhinweis';
import { abschnitt } from './abschnitte';

/** Erklärungen je Live-Stimme (für Eltern). */
const LIVE_TEXT: Record<LiveStimme, string> = {
  browser: 'Die eingebaute Stimme des Geräts. Kostenlos; je nach Gerät klingt sie unterschiedlich gut.',
  piper:
    `Eine freie Stimme, die direkt auf dem Gerät spricht – ohne Internet und ohne dass Text das Gerät verlässt. ` +
    `Einmaliger Download von etwa ${PIPER_MB} MB (Programm von jsDelivr, Stimme von Hugging Face).`,
  openrouter:
    'Klingt am natürlichsten. Jedes neue Wort geht als Text an OpenRouter und das Sprachmodell und kostet ' +
    'einen Bruchteil eines Cents auf Ihrem Konto; einmal vorgelesene Wörter bleiben auf dem Gerät gespeichert.',
};

const EINGABE_TEXT: Record<Spracheingabe, string> = {
  aus: 'Kein Mikrofon-Knopf beim Schreiben.',
  browser: 'Die Spracheingabe des Browsers. Je nach Browser geht die Aufnahme an dessen Hersteller (z. B. Google bei Chrome).',
  openrouter: 'Die Aufnahme geht an OpenRouter und ein Sprachmodell, das sie aufschreibt. Jede Eingabe kostet einen Bruchteil eines Cents.',
};

function auswahl<T extends string>(
  testid: string,
  optionen: readonly [T, string][],
  aktuell: T,
  setze: (w: T) => void,
): HTMLSelectElement {
  const s = el('select', { klasse: 'feld', testid, attr: { id: testid } },
    ...optionen.map(([wert, name]) => el('option', { attr: { value: wert }, text: name })));
  s.value = aktuell;
  s.addEventListener('change', () => {
    const treffer = optionen.find(([w]) => w === s.value);
    if (treffer) setze(treffer[0]);
  });
  return s;
}

function feldMitLabel(feld: HTMLElement & { id: string }, beschriftung: string): HTMLElement {
  return el('div', {}, el('label', { klasse: 'beschriftung', attr: { for: feld.id }, text: beschriftung }), feld);
}

/**
 * Baut den Abschnitt. `aufraeumen` sammelt Abmelde-Funktionen für unmount; `lebt()` sagt, ob die
 * Einstellungen noch offen sind (späte Antworten sonst verwerfen).
 */
export function tonquellen(ctx: Kontext, aufraeumen: (fn: () => void) => void, lebt: () => boolean): HTMLElement {
  const e = ctx.einstellungen.lese();
  const setze = (teil: Partial<Einstellungen>): void => ctx.einstellungen.setze(teil);
  const meldung = el('div', { klasse: 'einstellungen__meldung', testid: 'tonquellen-meldung', attr: { 'aria-live': 'polite' } });
  const melde = (f: unknown): void => {
    if (lebt()) meldung.replaceChildren(fehlerHinweis(f));
  };

  // ---- Live-Stimme ---------------------------------------------------------
  const liveErklaerung = el('p', { klasse: 'einstellungen__hinweis', testid: 'livestimme-erklaerung' });
  const live = auswahl<LiveStimme>('einstellung-livestimme', [
    ['browser', 'Stimme des Geräts'],
    ['piper', 'Offline-Stimme (einmal herunterladen)'],
    ['openrouter', 'OpenRouter (eigener Schlüssel, kostet)'],
  ], e.liveStimme, (w) => {
    meldung.replaceChildren();
    setze({ liveStimme: w });
    zeigeLive();
    // „Beim ersten Wählen herunterladen“: fehlt die Offline-Stimme, startet der Download sofort.
    if (w === 'piper') {
      piperStand().then((st) => {
        if (st === 'fehlt' && lebt()) lade();
      }, melde);
    }
  });
  const probe = el('button', {
    klasse: 'knopf knopf--icon',
    testid: 'stimme-probe',
    attr: { 'aria-label': 'Live-Stimme anhören', title: 'Live-Stimme anhören' },
    beiKlick: () => {
      meldung.replaceChildren();
      ctx.audio.live('Hallo! So klinge ich.').catch(melde);
    },
  }, icon('lautsprecher'));

  // ---- Offline-Stimme (Piper) -----------------------------------------------
  const piperZeile = el('p', { klasse: 'einstellungen__hinweis', testid: 'piper-stand', attr: { 'aria-live': 'polite' } });
  const balken = el('progress', { klasse: 'ton__balken', testid: 'piper-fortschritt', attr: { max: 1, hidden: true } });
  const ladenKnopf = el('button', {
    klasse: 'knopf knopf--leise',
    testid: 'piper-laden',
    beiKlick: () => lade(),
  }, icon('hochladen', { groesse: 20 }), el('span', { text: 'Offline-Stimme herunterladen' }));
  const entfernenKnopf = el('button', {
    klasse: 'knopf knopf--leise knopf--gefahr',
    testid: 'piper-entfernen',
    beiKlick: () => {
      meldung.replaceChildren();
      piperEntfernen().then(() => zeigePiper(), melde);
    },
  }, icon('loeschen', { groesse: 20 }), el('span', { text: 'vom Gerät löschen' }));
  const piperBlock = el('div', { klasse: 'stapel ton__piper', testid: 'piper-block' },
    piperZeile, balken, el('div', { klasse: 'ton__knoepfe' }, ladenKnopf, entfernenKnopf));

  function zeigePiperStand(st: PiperStand, anteil?: number): void {
    balken.hidden = st !== 'laedt';
    if (anteil !== undefined) balken.value = anteil;
    ladenKnopf.hidden = st !== 'fehlt';
    entfernenKnopf.hidden = st !== 'bereit';
    piperBlock.dataset.stand = st;
    piperZeile.textContent =
      st === 'bereit' ? 'Offline-Stimme: auf diesem Gerät, funktioniert ohne Internet.'
      : st === 'laedt' ? `Offline-Stimme wird geladen … ${Math.round((anteil ?? 0) * 100)} %`
      : `Offline-Stimme: noch nicht auf diesem Gerät (etwa ${PIPER_MB} MB, am besten im WLAN).`;
  }

  function zeigePiper(): void {
    piperStand().then((st) => {
      if (lebt()) zeigePiperStand(st);
    }, melde);
  }

  function lade(): void {
    meldung.replaceChildren();
    zeigePiperStand('laedt', 0);
    piperLaden().then(
      () => zeigePiper(),
      (f: unknown) => {
        melde(f);
        zeigePiper();
      },
    );
  }

  aufraeumen(piperFortschritt((anteil) => {
    if (!lebt()) return;
    if (anteil === undefined) zeigePiper();
    else zeigePiperStand('laedt', anteil);
  }));

  function zeigeLive(): void {
    const w = ctx.einstellungen.lese().liveStimme;
    liveErklaerung.textContent = LIVE_TEXT[w];
    piperBlock.hidden = w !== 'piper';
    if (w === 'piper') zeigePiper();
  }

  // ---- Spracheingabe ------------------------------------------------------
  const eingabeErklaerung = el('p', { klasse: 'einstellungen__hinweis', testid: 'spracheingabe-erklaerung' });
  const eingabeGrund = el('p', { klasse: 'einstellungen__hinweis ton__warnung', testid: 'spracheingabe-grund' });
  const eingabeErgebnis = el('p', { klasse: 'einstellungen__hinweis', testid: 'spracheingabe-ergebnis', attr: { 'aria-live': 'polite' } });
  const eingabe = auswahl<Spracheingabe>('einstellung-spracheingabe', [
    ['aus', 'aus'],
    ['browser', 'über den Browser'],
    ['openrouter', 'über OpenRouter (eigener Schlüssel, kostet)'],
  ], e.spracheingabe, (w) => {
    meldung.replaceChildren();
    setze({ spracheingabe: w });
    zeigeEingabe();
  });

  let lauf: SpracheingabeLauf | undefined;
  /** Start läuft (z. B. getUserMedia wartet auf die Erlaubnis): kein zweiter Lauf. */
  let startet = false;
  let weg = false;
  aufraeumen(() => {
    weg = true;
    lauf?.abbrechen();
  });
  const eingabeProbe = el('button', {
    klasse: 'knopf knopf--icon',
    testid: 'spracheingabe-probe',
    attr: { 'aria-label': 'Spracheingabe ausprobieren', title: 'Spracheingabe ausprobieren', 'aria-pressed': 'false' },
    beiKlick: () => {
      if (startet) return;
      if (lauf) {
        lauf.fertig();
        return;
      }
      startet = true;
      meldung.replaceChildren();
      eingabeErgebnis.textContent = '';
      eingabeProbe.setAttribute('aria-pressed', 'true');
      starteSpracheingabe(ctx.audio, ctx.einstellungen.lese(), {
        beiText: (t) => {
          if (lebt()) eingabeErgebnis.textContent = t ? `Verstanden: „${t}“` : 'Nichts verstanden.';
        },
        beiFehler: melde,
        beiZustand: (z) => {
          if (lebt()) eingabeErgebnis.textContent = z === 'hoert' ? 'Hört zu … (nochmal tippen = fertig)' : 'Schreibt auf …';
        },
        beiEnde: () => {
          lauf = undefined;
          eingabeProbe.setAttribute('aria-pressed', 'false');
        },
      })
        .then(
          (l) => {
            // Eltern haben die Einstellungen inzwischen verlassen: Mikrofon zu, nichts verschicken.
            if (weg || !lebt()) l.abbrechen();
            else lauf = l;
          },
          (f: unknown) => {
            eingabeProbe.setAttribute('aria-pressed', 'false');
            melde(f);
          },
        )
        .finally(() => {
          startet = false;
        });
    },
  }, icon('mikrofon'));

  function zeigeEingabe(): void {
    const aktuell = ctx.einstellungen.lese();
    eingabeErklaerung.textContent = EINGABE_TEXT[aktuell.spracheingabe];
    const grund = spracheingabeHinderungsgrund(aktuell);
    eingabeGrund.textContent = grund ?? '';
    eingabeGrund.hidden = !grund;
    eingabeProbe.hidden = aktuell.spracheingabe === 'aus' || !!grund;
  }

  // ---- Schlüssel ------------------------------------------------------------
  const schluessel = el('input', {
    klasse: 'feld',
    testid: 'einstellung-openrouter-key',
    attr: { type: 'password', id: 'einstellung-openrouter-key', autocomplete: 'off', spellcheck: 'false', placeholder: 'Schlüssel einfügen (optional)' },
  });
  schluessel.value = e.openrouterSchluessel ?? '';
  schluessel.addEventListener('input', () => {
    setze({ openrouterSchluessel: schluessel.value.trim() || undefined });
    zeigeEingabe();
  });

  zeigeLive();
  zeigeEingabe();

  return abschnitt('Stimme und Spracheingabe',
    el('div', { klasse: 'einstellungen__zeile' }, feldMitLabel(live, 'Live-Stimme für frei Geschriebenes'), probe),
    liveErklaerung,
    piperBlock,
    el('div', { klasse: 'einstellungen__zeile' }, feldMitLabel(eingabe, 'Spracheingabe (nur für Eltern)'), eingabeProbe),
    eingabeErklaerung,
    eingabeGrund,
    eingabeErgebnis,
    feldMitLabel(schluessel, 'Eigener OpenRouter-Schlüssel'),
    el('p', {
      klasse: 'einstellungen__hinweis',
      testid: 'openrouter-hinweis',
      text:
        'Feste Sätze, Laute und Tierstimmen kommen immer aus Dateien in der App. Live gesprochen wird nur, was frei ' +
        'geschrieben wurde. Mit OpenRouter geht dieser Text bzw. Ihre Spracheingabe an OpenRouter und das Sprachmodell ' +
        '– jede Anfrage kostet ein paar Cent oder weniger auf Ihrem Konto. Der Schlüssel bleibt nur auf diesem Gerät. ' +
        'Die Spracheingabe bewertet nie die Aussprache des Kindes.',
    }),
    stummHinweis(),
    meldung,
  );
}
