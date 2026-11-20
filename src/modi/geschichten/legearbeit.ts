/**
 * Legearbeit (Bau „spiele“) — ein Wort, in dem nur EINIGE Felder offen sind (F6 „Wer hilft?“, F7
 * „Meine Leute“). Gemeinsam für Geschichten und Leute; Leute importiert sie von hier.
 *
 * Testvertrag wie die Wortarbeit: `zielwort` (data-wort), `slot-<i>` (data-gefuellt, data-offen),
 * `rueckmeldung` (data-art), Tasten `taste-<b>` mit `data-hinweis="ja"` nach `hilfeNach` Fehlversuchen.
 *
 * Stufen (Einstellung `tierStufe`, Konzept F1): 1 nur der Anlaut offen, 2 Tasten · 2 Anlaut und
 * letzter Buchstabe offen, 3 Tasten · 3 alle Felder offen, Buchstaben des Worts + 2 Ablenker ·
 * 4 alle Felder offen, volles Alphabet. Ablenker kontrastieren immer (nie m/n, b/p/d …).
 *
 * Fehlerkontrolle ohne Strafe: der falsche Buchstabe klingt mit seinem Laut und wackelt. Nach dem
 * Lauten der vorbelegten Buchstaben (Nachklingen, ≈ 350 ms Abstand) liest `sprichWort` das Wort.
 *
 * KERNWUNSCH: Sobald die Wortarbeit (src/modi/nachfuellen/wortarbeit.ts) `offeneFelder`/`ablenker`
 * kann (Bau F1), soll diese Datei durch sie ersetzt werden — bis dahin ist sie die schlanke eigene Fassung.
 */
import { ANLAUT_LAUTE, LAUTE, type Ausgang, type Buchstabe, type Kontext, type RueckmeldungsArt, type TierStufe } from '../../kern/vertrag';
import { anzeigeZeichen, artVon, buchstabenVon } from '../../kern/alphabet';
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { erzeugeAlphabet } from '../../ui/alphabet';
import { kontrastiert, waehleAblenker } from '../../paket/anlaut';
import { spiele } from '../nachfuellen/sitzung';
import '../nachfuellen/wortarbeit.css';
import './legearbeit.css';

/** Abstand beim Nachklingen der Buchstaben (Konzept F1: ≈ 350 ms). */
const NACHKLANG_PAUSE_MS = 350;

export interface Aufbau {
  /** Indizes der offenen Felder in Lege-Reihenfolge. */
  offen: number[];
  /** Angebotene Tasten (Alphabet-Reihenfolge). */
  tasten: Buchstabe[];
}

/**
 * Welche Felder offen sind und welche Tasten liegen — je Stufe. `bekannt` (z. B. der Anfangsbuchstabe
 * des Kindes) wird als Ablenker bevorzugt. Wirft bei fremden Zeichen im Wort.
 */
export function aufbauFuer(wort: string, stufe: TierStufe, bekannt: readonly Buchstabe[] = []): Aufbau {
  const b = buchstabenVon(wort);
  const erster = b[0];
  if (!erster) throw new Error('Das Wort ist leer.');
  const imWort = new Set(b);
  const vorrat = ANLAUT_LAUTE.filter((x) => !imWort.has(x));
  const sortiert = (menge: Iterable<Buchstabe>): Buchstabe[] => {
    const s = new Set(menge);
    return LAUTE.filter((x) => s.has(x));
  };
  if (stufe === 1) {
    return { offen: [0], tasten: sortiert([erster, ...waehleAblenker(erster, vorrat, 1, bekannt)]) };
  }
  if (stufe === 2) {
    const letzter = b.length - 1;
    const ende = b[letzter];
    if (letzter < 1 || !ende) return { offen: [0], tasten: sortiert([erster, ...waehleAblenker(erster, vorrat, 1, bekannt)]) };
    const passend = vorrat.filter((x) => kontrastiert(x, ende));
    return { offen: [0, letzter], tasten: sortiert([erster, ende, ...waehleAblenker(erster, passend, 1, bekannt)]) };
  }
  const alle = b.map((_, i) => i);
  if (stufe === 3) return { offen: alle, tasten: sortiert([...imWort, ...waehleAblenker(erster, vorrat, 2, bekannt)]) };
  return { offen: alle, tasten: [...LAUTE] };
}

export interface LegeOptionen {
  ctx: Kontext;
  /** Kanonisches Schreibwort (klein). */
  wort: string;
  aufbau: Aufbau;
  /** Klein vor dem Wort (Tiere), wird nicht gelegt. */
  artikel?: string;
  /** Nach so vielen Fehlversuchen am selben Feld pulsiert die gesuchte Taste (B3). */
  hilfeNach: number;
  /** Liest das ganze Wort (Antippen des Worts und Abschluss des Nachklingens). */
  sprichWort(): Promise<Ausgang>;
  melde(fehler: unknown): void;
  /**
   * Alle offenen Felder gelegt. `klang` löst auf, wenn Nachklingen und Wort verklungen sind
   * (`abgebrochen`, wenn das Kind schon etwas Neues angetippt hat; `undefined` nach gemeldetem Fehler).
   */
  beiGeschafft(klang: Promise<Ausgang | undefined>): void;
}

export interface Legearbeit {
  el: HTMLElement;
  zerstoere(): void;
}

export function erzeugeLegearbeit(o: LegeOptionen): Legearbeit {
  const { ctx, wort, aufbau } = o;
  const buchstaben = buchstabenVon(wort);
  const offen = new Set(aufbau.offen);
  let gross = ctx.einstellungen.lese().grossbuchstaben;
  let schritt = 0;
  let fehlversuche = 0;
  let fertig = false;
  let zerstoert = false;

  const slots = buchstaben.map((b, i) => {
    const istOffen = offen.has(i);
    return el(
      'span',
      {
        klasse: ['feld-slot', istOffen ? '' : 'feld-slot--vorbelegt'].filter(Boolean),
        testid: `slot-${i}`,
        attr: { 'data-gefuellt': istOffen ? 'nein' : 'ja', 'data-offen': istOffen ? 'ja' : 'nein', 'data-art': artVon(b) },
      },
      istOffen
        ? el('span', { klasse: 'slot__schatten', attr: { 'aria-hidden': 'true' }, text: anzeigeZeichen(b, gross) })
        : el('span', { klasse: ['slot__buchstabe', artVon(b)], text: anzeigeZeichen(b, gross) }),
    );
  });

  function markiereDran(): void {
    slots.forEach((s, i) => s.classList.toggle('feld-slot--dran', !fertig && aufbau.offen[schritt] === i));
  }

  const zielwort = el(
    'button',
    {
      klasse: 'zielwort',
      testid: 'zielwort',
      attr: { 'data-wort': wort, 'aria-label': `Vorlesen: ${o.artikel ? o.artikel + ' ' : ''}${wort}` },
      beiKlick: () => void spiele(o.sprichWort(), o.melde),
    },
    o.artikel ? el('span', { klasse: 'zielwort__artikel', text: o.artikel }) : null,
    el('span', { klasse: 'felder', attr: { style: `--n: ${Math.max(3, buchstaben.length)}` } }, ...slots),
  );

  const rueckmeldung = el('p', { klasse: 'rueckmeldung', testid: 'rueckmeldung', attr: { 'data-art': 'leer', 'aria-live': 'polite' } });
  function setzeRueckmeldung(art: RueckmeldungsArt): void {
    rueckmeldung.dataset.art = art;
    if (art === 'geschafft') {
      rueckmeldung.replaceChildren(icon('haken', { groesse: 40, strich: 2.4 }), el('span', { klasse: 'sr-only', text: 'Geschafft' }));
      animiere(rueckmeldung, 'erscheint');
    } else if (art === 'falsch') {
      rueckmeldung.replaceChildren(el('span', { klasse: 'sr-only', text: 'Dieser Buchstabe passt hier noch nicht.' }));
    } else {
      rueckmeldung.replaceChildren();
    }
  }

  const wurzel = el('div', { klasse: 'wortarbeit legearbeit', attr: { 'data-zustand': 'arbeit' } }, zielwort, rueckmeldung);

  /** Vorbelegte und gelegte Buchstaben klingen der Reihe nach, dann das ganze Wort. */
  function nachklingen(): Promise<Ausgang> {
    const schritte = buchstaben.map((b, i) => () => {
      const slot = slots[i];
      if (slot) animiere(slot, 'feld-slot--klingt');
      return ctx.audio.laut(b);
    });
    return ctx.audio.kette([() => ctx.audio.kette(schritte, NACHKLANG_PAUSE_MS), () => o.sprichWort()], NACHKLANG_PAUSE_MS * 2);
  }

  const alphabet = erzeugeAlphabet({
    grossbuchstaben: gross,
    buchstaben: aufbau.tasten,
    gross: aufbau.tasten.length <= 6,
    beiTaste(b) {
      if (fertig || zerstoert) return;
      const feld = aufbau.offen[schritt];
      const soll = feld === undefined ? undefined : buchstaben[feld];
      if (feld === undefined || !soll) return;
      if (b !== soll) {
        alphabet.wackle(b);
        setzeRueckmeldung('falsch');
        fehlversuche++;
        const klang = spiele(ctx.audio.laut(b), o.melde);
        if (fehlversuche >= o.hilfeNach) {
          alphabet.hinweis(soll, true);
          void klang.then((a) => {
            if (a !== 'fertig' || fertig || zerstoert || aufbau.offen[schritt] !== feld) return;
            const slot = slots[feld];
            if (slot) animiere(slot, 'slot--hinweis');
            return spiele(ctx.audio.laut(soll), o.melde);
          });
        }
        return;
      }
      alphabet.hinweis(soll, false);
      fehlversuche = 0;
      const slot = slots[feld];
      if (slot) {
        slot.dataset.gefuellt = 'ja';
        slot.replaceChildren(el('span', { klasse: ['slot__buchstabe', artVon(b)], text: anzeigeZeichen(b, gross) }));
        animiere(slot, 'slot--angekommen');
      }
      const laut = spiele(ctx.audio.laut(b), o.melde);
      schritt++;
      if (schritt < aufbau.offen.length) {
        setzeRueckmeldung('richtig');
        markiereDran();
        return;
      }
      fertig = true;
      markiereDran();
      wurzel.dataset.zustand = 'geschafft';
      setzeRueckmeldung('geschafft');
      o.beiGeschafft(
        laut.then((a) => (a === 'fertig' && !zerstoert ? spiele(nachklingen(), o.melde) : a)),
      );
    },
  });
  wurzel.append(alphabet.el);
  markiereDran();

  const abmelden = ctx.einstellungen.abonniere((e) => {
    if (e.grossbuchstaben === gross) return;
    gross = e.grossbuchstaben;
    alphabet.setzeGross(gross);
    slots.forEach((slot, i) => {
      const b = buchstaben[i];
      const inhalt = slot.firstElementChild;
      if (b && inhalt) inhalt.textContent = anzeigeZeichen(b, gross);
    });
  });

  return {
    el: wurzel,
    zerstoere() {
      if (zerstoert) return;
      zerstoert = true;
      abmelden();
      alphabet.zerstoere();
      wurzel.remove();
    },
  };
}
