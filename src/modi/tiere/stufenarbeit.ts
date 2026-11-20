/**
 * Stufen-Arbeit (F1 Stufe 1–3, B3): ein Wort, in dem nur einige Felder offen sind.
 *
 * - Offene Felder (`offen`) werden der Reihe nach gelegt; alle anderen stehen schon da.
 * - Nur wenige, große Tasten (`tasten`, z. B. Anlaut + ein kontrastierender Ablenker).
 * - Fehlerkontrolle im Material: der falsche Buchstabe klingt mit seinem Laut und wackelt — kein
 *   Fehlerton, kein Rot. Nach `hilfeNach` Fehlversuchen am selben Feld pulsiert die gesuchte Taste
 *   (`data-hinweis="ja"`) und ihr Laut klingt.
 * - Nachklingen: Ist das letzte offene Feld gelegt, leuchten die Buchstaben der Reihe nach auf und
 *   klingen mit ihrem Laut (≈ 350 ms Abstand), danach wird das Wort gelesen (`sprichWort`).
 *
 * Testvertrag wie die Wortarbeit: `zielwort` (data-wort), `slot-<i>` (data-gefuellt, data-offen),
 * `rueckmeldung` (data-art), `taste-<b>` (data-hinweis). Exportiert, damit „Wer hilft?“ und
 * „Meine Leute“ dieselbe Stufe-1-Arbeit nutzen können.
 */
import { anzeigeZeichen, artVon, buchstabenVon } from '../../kern/alphabet';
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Ausgang, Buchstabe, Kontext, RueckmeldungsArt } from '../../kern/vertrag';
import { erzeugeAlphabet } from '../../ui/alphabet';
import { spiele } from '../nachfuellen/sitzung';
import '../nachfuellen/wortarbeit.css';

/** Abstand der Laute beim Nachklingen (Lautsynthese, Konzept F1). */
export const NACHKLANG_ABSTAND_MS = 350;

export interface StufenArbeitOptionen {
  ctx: Pick<Kontext, 'audio' | 'einstellungen'>;
  /** Kanonisches Schreibwort (klein). */
  wort: string;
  /** Offene Felder (Indizes), der Reihe nach zu legen. Mindestens eins. */
  offen: readonly number[];
  /** Die Tasten im Kasten (2–6 werden groß gezeigt). Müssen alle Buchstaben der offenen Felder enthalten. */
  tasten: readonly Buchstabe[];
  /** Klein vor dem Wort angezeigt, wird nicht geschrieben. */
  artikel?: string;
  /** Hilfe nach so vielen Fehlversuchen am selben Feld (Einstellung `hilfeNach`). */
  hilfeNach: number;
  /** Liest am Ende das ganze Wort (z. B. Paket-Audio des Namens). Standard: `audio.wort(wort)`. */
  sprichWort?(): Promise<Ausgang>;
  melde(fehler: unknown): void;
  /**
   * Wort fertig. `nachklang` löst auf, wenn Nachklingen und Wort gesprochen sind: `fertig`,
   * `abgebrochen` (das Kind hat etwas Neues angetippt) oder `undefined` nach einem gemeldeten Fehler.
   */
  beiGeschafft(nachklang: Promise<Ausgang | undefined>): void;
}

export interface StufenArbeit {
  el: HTMLElement;
  zerstoere(): void;
}

const warte = (ms: number): Promise<void> => new Promise((ok) => window.setTimeout(ok, ms));

export function erzeugeStufenArbeit(o: StufenArbeitOptionen): StufenArbeit {
  const { ctx, wort } = o;
  const buchstaben = buchstabenVon(wort); // wirft bei fremden Zeichen
  const offen = [...new Set(o.offen)].filter((i) => i >= 0 && i < buchstaben.length).sort((a, b) => a - b);
  if (offen.length === 0) throw new Error(`Stufen-Arbeit „${wort}“: kein offenes Feld.`);
  for (const i of offen) {
    const b = buchstaben[i];
    if (b && !o.tasten.includes(b)) throw new Error(`Stufen-Arbeit „${wort}“: Die Taste „${b}“ fehlt im Kasten.`);
  }
  let gross = ctx.einstellungen.lese().grossbuchstaben;
  let schritt = 0; // Index in `offen`
  let fehlversuche = 0;
  let fertig = false;
  let zerstoert = false;

  const zeichen = (b: Buchstabe): HTMLElement => el('span', { klasse: ['slot__buchstabe', artVon(b)], text: anzeigeZeichen(b, gross) });

  const slots = buchstaben.map((b, i) => {
    const istOffen = offen.includes(i);
    return el(
      'span',
      {
        klasse: ['feld-slot', istOffen ? 'feld-slot--offen' : ''],
        testid: `slot-${i}`,
        attr: { 'data-gefuellt': istOffen ? 'nein' : 'ja', 'data-offen': istOffen ? 'ja' : 'nein', 'data-art': artVon(b) },
      },
      istOffen ? el('span', { klasse: 'slot__schatten', attr: { 'aria-hidden': 'true' }, text: anzeigeZeichen(b, gross) }) : zeichen(b),
    );
  });
  const aktuellesFeld = (): HTMLElement | undefined => {
    const i = offen[schritt];
    return i === undefined ? undefined : slots[i];
  };
  aktuellesFeld()?.classList.add('feld-slot--dran');

  const zielwort = el(
    'button',
    {
      klasse: 'zielwort',
      testid: 'zielwort',
      attr: { 'data-wort': wort, 'aria-label': `Vorlesen: ${o.artikel ? o.artikel + ' ' : ''}${wort}` },
      beiKlick: () => void spiele(o.sprichWort ? o.sprichWort() : ctx.audio.wort(wort), o.melde),
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
    } else rueckmeldung.replaceChildren();
  }

  const wurzel = el('div', { klasse: 'wortarbeit stufenarbeit', attr: { 'data-zustand': 'arbeit' } }, zielwort, rueckmeldung);

  /** Lautsynthese: Buchstaben ab `von` der Reihe nach leuchten und klingen lassen, dann das Wort. */
  async function nachklingen(von: number, tippLaut: Promise<Ausgang | undefined>): Promise<Ausgang | undefined> {
    if ((await tippLaut) === 'abgebrochen') return 'abgebrochen';
    for (let i = von; i < buchstaben.length; i++) {
      const b = buchstaben[i];
      const slot = slots[i];
      if (!b || !slot || zerstoert) return 'abgebrochen';
      animiere(slot, 'slot--klingt');
      const [a] = await Promise.all([spiele(ctx.audio.laut(b), o.melde), warte(NACHKLANG_ABSTAND_MS)]);
      if (a === 'abgebrochen' || zerstoert) return 'abgebrochen';
    }
    await warte(NACHKLANG_ABSTAND_MS);
    if (zerstoert) return 'abgebrochen';
    return spiele(o.sprichWort ? o.sprichWort() : ctx.audio.wort(wort), o.melde);
  }

  const alphabet = erzeugeAlphabet({
    grossbuchstaben: gross,
    buchstaben: o.tasten,
    gross: o.tasten.length <= 6,
    beiTaste(b) {
      if (fertig) return;
      const feld = offen[schritt];
      const soll = feld === undefined ? undefined : buchstaben[feld];
      if (feld === undefined || !soll) return;
      if (b !== soll) {
        alphabet.wackle(b);
        setzeRueckmeldung('falsch');
        fehlversuche++;
        const klang = spiele(ctx.audio.laut(b), o.melde);
        if (fehlversuche >= o.hilfeNach) {
          // Hilfe vom Material: die gesuchte Taste pulsiert, danach klingt ihr Laut.
          alphabet.hinweis(soll, true);
          void klang.then((a) => {
            if (a !== 'fertig' || fertig || zerstoert || offen[schritt] !== feld) return;
            const slot = slots[feld];
            if (slot) animiere(slot, 'slot--hinweis');
            return spiele(ctx.audio.laut(soll), o.melde);
          });
        }
        return;
      }
      fehlversuche = 0;
      alphabet.hinweis(soll, false);
      const slot = slots[feld];
      if (slot) {
        slot.dataset.gefuellt = 'ja';
        slot.classList.remove('feld-slot--dran');
        slot.replaceChildren(zeichen(b));
        animiere(slot, 'slot--angekommen');
      }
      const laut = spiele(ctx.audio.laut(b), o.melde);
      schritt++;
      if (schritt < offen.length) {
        aktuellesFeld()?.classList.add('feld-slot--dran');
        setzeRueckmeldung('richtig');
        return;
      }
      fertig = true;
      wurzel.dataset.zustand = 'geschafft';
      setzeRueckmeldung('geschafft');
      // Nach dem Anlaut klingen die übrigen Buchstaben; war das letzte Feld offen, das ganze Wort.
      const von = feld === buchstaben.length - 1 ? 0 : feld + 1;
      o.beiGeschafft(nachklingen(von, laut));
    },
  });
  wurzel.append(alphabet.el);

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
