/**
 * Wortarbeit (Bau „schreiben"): ein Wort Buchstabe für Buchstabe in Felder legen.
 * Gemeinsam genutzt von Nachfüllen und Tier-Modus.
 *
 * Testvertrag:
 * - data-testid="zielwort" mit data-wort = kanonisches, kleines Wort; Antippen liest es vor.
 * - data-testid="slot-<i>" mit data-gefuellt="ja|nein".
 * - data-testid="rueckmeldung" mit data-art leer|richtig|falsch|geschafft.
 *
 * Fehlerkontrolle im Material: ein falscher Buchstabe klingt mit seinem normalen Laut, wackelt
 * sanft und bleibt im Kasten — kein Rot, kein Fehlerton, keine Strafe. So hört das Kind selbst,
 * dass er nicht passt. Nach dem dritten Fehlversuch am selben Feld klingt danach der gesuchte
 * Laut, und das Feld leuchtet kurz auf. Der richtige fliegt in sein Feld und klingt.
 */
import { LAUTE, type Ausgang, type Buchstabe, type Kontext, type RueckmeldungsArt } from '../../kern/vertrag';
import { anzeigeZeichen, artVon, buchstabenVon } from '../../kern/alphabet';
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { erzeugeAlphabet, tasteIn } from '../../ui/alphabet';
import { spiele } from './sitzung';
import './wortarbeit.css';

export interface WortarbeitOptionen {
  ctx: Kontext;
  /** Kanonisches Schreibwort (klein). */
  wort: string;
  /** Schattenbuchstaben als Vorlage zeigen. */
  vorlage: boolean;
  /** true = alle 30 Buchstaben (Holzkasten), false = Buchstaben des Worts + 3–4 Ablenker. */
  vollesAlphabet: boolean;
  /** Klein vor dem Wort angezeigt, wird nicht geschrieben (Tier-Modus). */
  artikel?: string;
  melde(fehler: unknown): void;
  /**
   * Wort fertig. `letzterLaut` löst auf, wenn der Laut des letzten Buchstabens verklungen ist:
   * `fertig`, `abgebrochen` (das Kind hat schon etwas Neues angetippt) oder `undefined` nach einem gemeldeten Fehler.
   */
  beiGeschafft(letzterLaut: Promise<Ausgang | undefined>): void;
}

export interface Wortarbeit {
  el: HTMLElement;
  zerstoere(): void;
}

/** Ablenker: gut unterscheidbare, häufige Buchstaben (keine Exoten wie q, x, y, c, ß). */
const ABLENKER_VORRAT: readonly Buchstabe[] = LAUTE.filter((b) => !['q', 'x', 'y', 'c', 'ß'].includes(b));

function mische<T>(liste: readonly T[]): T[] {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const x = a[i] as T;
    a[i] = a[j] as T;
    a[j] = x;
  }
  return a;
}

/** Buchstaben des Worts + Ablenker (mindestens ein Vokal und ein Konsonant, wenn möglich), in Alphabet-Reihenfolge. */
export function auswahlFuer(buchstaben: readonly Buchstabe[]): Buchstabe[] {
  const im = new Set(buchstaben);
  const anzahl = im.size <= 3 ? 4 : 3;
  const frei = mische(ABLENKER_VORRAT.filter((b) => !im.has(b)));
  const gewaehlt: Buchstabe[] = [];
  const vokal = frei.find((b) => artVon(b) === 'vokal');
  const konsonant = frei.find((b) => artVon(b) === 'konsonant');
  if (vokal) gewaehlt.push(vokal);
  if (konsonant) gewaehlt.push(konsonant);
  for (const b of frei) {
    if (gewaehlt.length >= anzahl) break;
    if (!gewaehlt.includes(b)) gewaehlt.push(b);
  }
  const alle = new Set<Buchstabe>([...im, ...gewaehlt]);
  return LAUTE.filter((b) => alle.has(b));
}

const ruhig = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function erzeugeWortarbeit(o: WortarbeitOptionen): Wortarbeit {
  const { ctx, wort } = o;
  const buchstaben = buchstabenVon(wort); // wirft bei fremden Zeichen
  let gross = ctx.einstellungen.lese().grossbuchstaben;
  let index = 0;
  let fehlversuche = 0;
  let fertig = false;
  const flieger = new Set<HTMLElement>();

  const slots = buchstaben.map((b, i) =>
    el(
      'span',
      { klasse: 'feld-slot', testid: `slot-${i}`, attr: { 'data-gefuellt': 'nein', 'data-art': artVon(b) } },
      o.vorlage ? el('span', { klasse: 'slot__schatten', attr: { 'aria-hidden': 'true' }, text: anzeigeZeichen(b, gross) }) : null,
    ),
  );

  const zielwort = el(
    'button',
    {
      klasse: 'zielwort',
      testid: 'zielwort',
      attr: { 'data-wort': wort, 'aria-label': `Vorlesen: ${o.artikel ? o.artikel + ' ' : ''}${wort}` },
      beiKlick: () => void spiele(ctx.audio.wort(wort), o.melde),
    },
    o.artikel ? el('span', { klasse: 'zielwort__artikel', text: o.artikel }) : null,
    el('span', { klasse: 'felder' }, ...slots),
  );

  const rueckmeldung = el('p', {
    klasse: 'rueckmeldung',
    testid: 'rueckmeldung',
    attr: { 'data-art': 'leer', 'aria-live': 'polite' },
  });

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

  const wurzel = el('div', { klasse: 'wortarbeit', attr: { 'data-zustand': 'arbeit' } }, zielwort, rueckmeldung);

  function fuelle(i: number, b: Buchstabe): void {
    const slot = slots[i];
    if (!slot) return;
    const zeichen = el('span', { klasse: ['slot__buchstabe', artVon(b)], text: anzeigeZeichen(b, gross) });
    slot.dataset.gefuellt = 'ja';
    slot.replaceChildren(zeichen);
    const start = tasteIn(alphabet, b);
    if (!start || ruhig() || typeof start.animate !== 'function') {
      animiere(slot, 'slot--angekommen');
      return;
    }
    // Der Buchstabe fliegt von der Kachel ins Feld; die Kachel bleibt im Kasten (mehrfach nutzbar).
    const von = start.getBoundingClientRect();
    const nach = slot.getBoundingClientRect();
    const flug = el('span', { klasse: ['flieger', artVon(b)], attr: { 'aria-hidden': 'true' }, text: anzeigeZeichen(b, gross) });
    Object.assign(flug.style, { left: `${von.left}px`, top: `${von.top}px`, width: `${von.width}px`, height: `${von.height}px` });
    document.body.append(flug);
    flieger.add(flug);
    zeichen.classList.add('slot__buchstabe--unterwegs');
    const dx = nach.left + nach.width / 2 - (von.left + von.width / 2);
    const dy = nach.top + nach.height / 2 - (von.top + von.height / 2);
    const s = Math.max(0.6, Math.min(1.6, nach.width / Math.max(1, von.width)));
    const anim = flug.animate(
      [
        { transform: 'translate(0, 0) scale(1)', offset: 0 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + s) / 2 + 0.08})`, offset: 0.5 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s})`, offset: 1 },
      ],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' },
    );
    const landen = (): void => {
      flug.remove();
      flieger.delete(flug);
      zeichen.classList.remove('slot__buchstabe--unterwegs');
      animiere(slot, 'slot--angekommen');
    };
    anim.onfinish = landen;
    anim.oncancel = landen;
  }

  const alphabet = erzeugeAlphabet({
    grossbuchstaben: gross,
    buchstaben: o.vollesAlphabet ? undefined : auswahlFuer(buchstaben),
    beiTaste(b) {
      if (fertig) return;
      const soll = buchstaben[index];
      if (b !== soll) {
        alphabet.wackle(b);
        setzeRueckmeldung('falsch');
        fehlversuche++;
        const feld = index;
        const klang = spiele(ctx.audio.buchstabe(b), o.melde);
        if (fehlversuche >= 3 && soll) {
          // Hilfe ohne Strafe: nach dem eigenen Laut der gesuchte, das Feld leuchtet kurz auf.
          void klang.then((a) => {
            if (a !== 'fertig' || fertig || zerstoert || index !== feld) return;
            const slot = slots[feld];
            if (slot) animiere(slot, 'slot--hinweis');
            return spiele(ctx.audio.buchstabe(soll), o.melde);
          });
        }
        return;
      }
      fehlversuche = 0;
      fuelle(index, b);
      const laut = spiele(ctx.audio.buchstabe(b), o.melde);
      index++;
      if (index < buchstaben.length) {
        setzeRueckmeldung('richtig');
        return;
      }
      fertig = true;
      wurzel.dataset.zustand = 'geschafft';
      setzeRueckmeldung('geschafft');
      o.beiGeschafft(laut);
    },
  });
  wurzel.append(alphabet.el);

  let zerstoert = false;
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
      for (const f of flieger) f.remove();
      flieger.clear();
      wurzel.remove();
    },
  };
}
