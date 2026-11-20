/**
 * Wortarbeit (Bau „schreiben“): ein Wort Buchstabe für Buchstabe in Felder legen.
 * Gemeinsam genutzt von Nachfüllen, Tier-Modus (F1-Stufen), Wer hilft? (F6) und Meine Leute (F7).
 *
 * Testvertrag:
 * - data-testid="zielwort" mit data-wort = kanonisches, kleines Wort; Antippen liest es vor.
 * - data-testid="slot-<i>" mit data-gefuellt="ja|nein" und data-offen="ja|nein"
 *   (offen = dieses Feld legt das Kind selbst; nicht offene Felder sind von Anfang an gefüllt).
 * - data-testid="rueckmeldung" mit data-art leer|richtig|falsch|geschafft.
 * - Hilfe: die gesuchte Taste trägt data-hinweis="ja" (über AlphabetKomponente.hinweis).
 *
 * Fehlerkontrolle im Material: ein falscher Buchstabe klingt mit seinem normalen Laut, wackelt
 * sanft und bleibt im Kasten — kein Rot, kein Fehlerton, keine Strafe. So hört das Kind selbst,
 * dass er nicht passt. Nach `hilfeNach` Fehlversuchen am selben Feld pulsiert die gesuchte Taste
 * (bis sie gelegt ist), nach dem eigenen Laut klingt der gesuchte (`hilfeTon`) und das Feld
 * leuchtet kurz auf. Der richtige Buchstabe fliegt in sein Feld und klingt.
 *
 * ---------------------------------------------------------------------------------------------
 * Stufen (F1) — schnittstellenrein, die Wortarbeit kennt keine „Stufe“, nur diese Optionen:
 *
 *   Stufe | offeneFelder                         | Tasten                         | nachklingen
 *   ------+--------------------------------------+--------------------------------+------------
 *     1   | [0]                                  | vollesAlphabet:false, ablenker:1 | (Standard: an)
 *     2   | [0, letzte] (nur bei Einzellaut-Ende)| vollesAlphabet:false, ablenker:1 | (Standard: an)
 *     3   | — (alle)                             | vollesAlphabet:false, ablenker:2 | —
 *     4   | — (alle)                             | vollesAlphabet:true              | —
 *
 * - `offeneFelder`: Positionen, die das Kind selbst legt, in Wort-Reihenfolge. Alle anderen
 *   Felder stehen sofort gefüllt da. Fehlt die Option, legt das Kind alles (Bestand).
 * - `ablenker`: Zahl der Ablenker-Tasten neben den Buchstaben der offenen Felder. Gewählt werden
 *   nur Buchstaben, die mit JEDEM gesuchten Buchstaben und untereinander kontrastieren
 *   (`kontrastiert`: nie m/n, b/p/d, f/w/v, s/z/ß/x, g/k …). `bevorzugteAblenker` (z. B. dem Kind
 *   schon bekannte Buchstaben) kommen zuerst dran. Fehlt `ablenker`, gilt die Bestandsauswahl
 *   (Wort + 3–4 gut unterscheidbare Ablenker).
 * - `nachklingen`: Sind alle offenen Felder gelegt, leuchten die übrigen (vorbelegten) Felder der
 *   Reihe nach auf und jedes klingt mit seinem Laut, ≈ 350 ms Abstand (Lautsynthese über
 *   `AudioDienst.kette`). Erst danach löst `letzterLaut` in `beiGeschafft` auf. Standard: an,
 *   sobald mindestens ein Feld vorbelegt ist.
 * - `hilfeNach` (B3): Fehlversuche am selben Feld bis zur Hilfe. Aufrufer geben die Einstellung
 *   `einstellungen.hilfeNach` weiter (Standard dort 2). Fehlt die Option: 3 (Bestand).
 * - `hilfeTon`: was nach dem Fehlversuch zur Hilfe klingt (Tier-Modus: „das Tier sagt {laut}!“).
 *   Standard: der Laut des gesuchten Buchstabens (`audio.buchstabe`).
 * - `grosseTasten`: große Tasten (AlphabetOptionen.gross), gedacht für 2–6 Tasten (Stufe 1/2).
 * ---------------------------------------------------------------------------------------------
 */
import { LAUTE, type Ausgang, type Buchstabe, type KettenSchritt, type Kontext, type RueckmeldungsArt } from '../../kern/vertrag';
import { anzeigeZeichen, artVon, buchstabenVon } from '../../kern/alphabet';
import { animiere, el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { kontrastiert, waehleAblenker } from '../../paket/anlaut';
import { erzeugeAlphabet, tasteIn } from '../../ui/alphabet';
import { spiele } from './sitzung';
import './wortarbeit.css';

export interface WortarbeitOptionen {
  ctx: Kontext;
  /** Kanonisches Schreibwort (klein). */
  wort: string;
  /** Schattenbuchstaben als Vorlage zeigen. */
  vorlage: boolean;
  /** true = alle 30 Buchstaben (Holzkasten), false = Buchstaben der offenen Felder + Ablenker. */
  vollesAlphabet: boolean;
  /** Klein vor dem Wort angezeigt, wird nicht geschrieben (Tier-Modus). */
  artikel?: string;
  /** Sichtbares Lautsprecher-Zeichen über dem Wort (Nachfüllen: dort gibt es kein Bild zum Antippen). */
  hoerZeichen?: boolean;
  /** Positionen, die das Kind selbst legt (Stufen, siehe Kopfkommentar). Standard: alle. */
  offeneFelder?: readonly number[];
  /** Zahl kontrastierender Ablenker neben den gesuchten Buchstaben (nur ohne volles Alphabet). */
  ablenker?: number;
  /** Bevorzugte Ablenker (z. B. schon bekannte Buchstaben), falls sie kontrastieren. */
  bevorzugteAblenker?: readonly Buchstabe[];
  /** Vorbelegte Felder nach dem letzten offenen Feld der Reihe nach erklingen lassen. Standard: an, wenn etwas vorbelegt ist. */
  nachklingen?: boolean;
  /** Hilfsschwelle (B3). Standard 3; Aufrufer reichen `einstellungen.hilfeNach` durch. */
  hilfeNach?: number;
  /** Hilfe-Ton nach dem Fehlversuch. Standard: Laut des gesuchten Buchstabens. */
  hilfeTon?(soll: Buchstabe): Promise<Ausgang>;
  /** Große Tasten (2–6 Tasten). Standard false. */
  grosseTasten?: boolean;
  melde(fehler: unknown): void;
  /**
   * Wort fertig. `letzterLaut` löst auf, wenn der Laut des letzten Buchstabens (bzw. das
   * Nachklingen) verklungen ist: `fertig`, `abgebrochen` (das Kind hat schon etwas Neues
   * angetippt) oder `undefined` nach einem gemeldeten Fehler.
   */
  beiGeschafft(letzterLaut: Promise<Ausgang | undefined>): void;
}

export interface Wortarbeit {
  el: HTMLElement;
  zerstoere(): void;
}

/** Bestand: Fehlversuche bis zur Hilfe, wenn der Aufrufer nichts angibt. */
export const HILFE_NACH_STANDARD = 3;
/** Abstand zwischen den Lauten beim Nachklingen (F1). */
export const NACHKLANG_PAUSE_MS = 350;

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

/**
 * Gesuchte Buchstaben + `anzahl` Ablenker, die mit jedem gesuchten und untereinander
 * kontrastieren, in Alphabet-Reihenfolge. Wirft, wenn es nicht genug solche Buchstaben gibt.
 */
export function auswahlMitAblenkern(gesucht: readonly Buchstabe[], anzahl: number, bevorzugt: readonly Buchstabe[] = []): Buchstabe[] {
  const im = new Set(gesucht);
  const erster = gesucht[0];
  if (!erster) throw new Error('Die Wortarbeit braucht mindestens einen gesuchten Buchstaben.');
  const vorrat = ABLENKER_VORRAT.filter((b) => !im.has(b) && gesucht.every((g) => kontrastiert(g, b)));
  const ablenker = anzahl > 0 ? waehleAblenker(erster, vorrat, anzahl, bevorzugt) : [];
  const alle = new Set<Buchstabe>([...im, ...ablenker]);
  return LAUTE.filter((b) => alle.has(b));
}

/** Prüft und sortiert die offenen Felder. Ungültige Angaben sind ein Programmierfehler → werfen. */
function offeneReihe(offen: readonly number[] | undefined, laenge: number): number[] {
  if (!offen) return Array.from({ length: laenge }, (_, i) => i);
  const reihe = [...new Set(offen)].sort((a, b) => a - b);
  if (!reihe.length) throw new Error('Die Wortarbeit braucht mindestens ein offenes Feld.');
  for (const i of reihe) {
    if (!Number.isInteger(i) || i < 0 || i >= laenge) throw new Error(`Offenes Feld ${i} liegt außerhalb des Worts (Länge ${laenge}).`);
  }
  return reihe;
}

const ruhig = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function erzeugeWortarbeit(o: WortarbeitOptionen): Wortarbeit {
  const { ctx, wort } = o;
  const buchstaben = buchstabenVon(wort); // wirft bei fremden Zeichen
  const reihe = offeneReihe(o.offeneFelder, buchstaben.length);
  const offen = new Set(reihe);
  const hilfeNach = Math.max(1, Math.round(o.hilfeNach ?? HILFE_NACH_STANDARD));
  const nachklingen = o.nachklingen ?? reihe.length < buchstaben.length;
  let gross = ctx.einstellungen.lese().grossbuchstaben;
  /** Position in `reihe` (welches offene Feld als Nächstes dran ist). */
  let schritt = 0;
  let fehlversuche = 0;
  let fertig = false;
  let zerstoert = false;
  /** Taste, die gerade als Hilfe pulsiert. */
  let hinweisAn: Buchstabe | undefined;
  const flieger = new Set<HTMLElement>();

  const slots = buchstaben.map((b, i) => {
    const istOffen = offen.has(i);
    const slot = el(
      'span',
      {
        klasse: 'feld-slot',
        testid: `slot-${i}`,
        attr: { 'data-gefuellt': istOffen ? 'nein' : 'ja', 'data-offen': istOffen ? 'ja' : 'nein', 'data-art': artVon(b) },
      },
      istOffen
        ? o.vorlage
          ? el('span', { klasse: 'slot__schatten', attr: { 'aria-hidden': 'true' }, text: anzeigeZeichen(b, gross) })
          : null
        : el('span', { klasse: ['slot__buchstabe', 'slot__buchstabe--vorbelegt', artVon(b)], text: anzeigeZeichen(b, gross) }),
    );
    return slot;
  });
  // Das Feld, das als Nächstes dran ist, leuchtet sanft (nur wenn nicht alle offen sind — sonst ist es klar).
  const markiereDran = (): void => {
    if (reihe.length === buchstaben.length) return;
    slots.forEach((s, i) => s.classList.toggle('feld-slot--dran', i === reihe[schritt] && !fertig));
  };

  const zielwort = el(
    'button',
    {
      klasse: 'zielwort',
      testid: 'zielwort',
      attr: { 'data-wort': wort, 'aria-label': `Vorlesen: ${o.artikel ? o.artikel + ' ' : ''}${wort}` },
      beiKlick: () => void spiele(ctx.audio.wort(wort), o.melde),
    },
    o.hoerZeichen ? el('span', { klasse: 'zielwort__hoeren' }, icon('lautsprecher', { groesse: 40, strich: 2 })) : null,
    o.artikel ? el('span', { klasse: 'zielwort__artikel', text: o.artikel }) : null,
    el('span', { klasse: 'felder', attr: { style: `--n: ${Math.max(3, buchstaben.length)}` } }, ...slots),
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

  const wurzel = el(
    'div',
    { klasse: 'wortarbeit', attr: { 'data-zustand': 'arbeit' } },
    el('div', { klasse: 'wortarbeit__wort' }, zielwort, rueckmeldung),
  );

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

  function hinweisAus(): void {
    if (hinweisAn) alphabet.hinweis(hinweisAn, false);
    hinweisAn = undefined;
  }

  /** Nach dem letzten offenen Feld: vorbelegte Felder der Reihe nach erklingen lassen (Lautsynthese). */
  function klingNach(letzterLaut: Promise<Ausgang | undefined>): Promise<Ausgang | undefined> {
    return letzterLaut.then((a) => {
      if (a === 'abgebrochen' || zerstoert) return a;
      const schritte: KettenSchritt[] = buchstaben
        .map((b, i) => ({ b, i }))
        .filter(({ i }) => !offen.has(i))
        .map(({ b, i }) => () => {
          const slot = slots[i];
          if (slot && !zerstoert) animiere(slot, 'slot--klingt');
          return ctx.audio.laut(b);
        });
      if (!schritte.length) return a;
      return spiele(ctx.audio.kette(schritte, NACHKLANG_PAUSE_MS), o.melde);
    });
  }

  const auswahl = o.vollesAlphabet
    ? undefined
    : o.ablenker !== undefined
      ? auswahlMitAblenkern(
          reihe.map((i) => buchstaben[i] as Buchstabe),
          o.ablenker,
          o.bevorzugteAblenker,
        )
      : auswahlFuer(reihe.map((i) => buchstaben[i] as Buchstabe));

  const alphabet = erzeugeAlphabet({
    grossbuchstaben: gross,
    buchstaben: auswahl,
    gross: o.grosseTasten ?? false,
    beiTaste(b) {
      if (fertig) return;
      const feld = reihe[schritt];
      if (feld === undefined) return;
      const soll = buchstaben[feld];
      if (!soll) return;
      if (b !== soll) {
        alphabet.wackle(b);
        setzeRueckmeldung('falsch');
        fehlversuche++;
        const klang = spiele(ctx.audio.buchstabe(b), o.melde);
        if (fehlversuche >= hilfeNach) {
          // Hilfe ohne Strafe: die gesuchte Taste pulsiert, nach dem eigenen Laut klingt der gesuchte.
          if (hinweisAn !== soll) {
            hinweisAus();
            alphabet.hinweis(soll, true);
            hinweisAn = soll;
          }
          void klang.then((a) => {
            if (a !== 'fertig' || fertig || zerstoert || reihe[schritt] !== feld) return;
            const slot = slots[feld];
            if (slot) animiere(slot, 'slot--hinweis');
            return spiele(o.hilfeTon ? o.hilfeTon(soll) : ctx.audio.buchstabe(soll), o.melde);
          });
        }
        return;
      }
      fehlversuche = 0;
      hinweisAus();
      fuelle(feld, b);
      const laut = spiele(ctx.audio.buchstabe(b), o.melde);
      schritt++;
      if (schritt < reihe.length) {
        setzeRueckmeldung('richtig');
        markiereDran();
        return;
      }
      fertig = true;
      markiereDran();
      wurzel.dataset.zustand = 'geschafft';
      setzeRueckmeldung('geschafft');
      o.beiGeschafft(nachklingen ? klingNach(laut) : laut);
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
      for (const f of flieger) f.remove();
      flieger.clear();
      wurzel.remove();
    },
  };
}
