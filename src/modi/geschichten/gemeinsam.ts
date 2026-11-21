/**
 * Kleine gemeinsame Hilfen der Spiele F5–F7 (Bau „spiele“): Medaillon-Knöpfe, Elternzeile,
 * Sprechketten, die bei einem fehlenden Ton weiterlaufen (der Fehler wird sichtbar gemeldet), und
 * die Aufgabe (offene Felder + Tasten) für ein freies Wort in der gemeinsamen Stufen-Arbeit
 * (src/modi/tiere/stufenarbeit.ts).
 */
import { buchstabenVon } from '../../kern/alphabet';
import { animiere, el } from '../../kern/dom';
import { icon, type IconName } from '../../kern/ui/icons';
import { ANLAUT_LAUTE, BEWEGUNGEN, LAUTE, type Ausgang, type Bewegung, type Buchstabe, type Kontext, type KettenSchritt, type Tier, type TierStufe } from '../../kern/vertrag';
import { bewegungVon } from '../../paket/bewegung';
import { kontrastiert, waehleAblenker } from '../../paket/anlaut';
import { bewege, erzeugeMedaillon } from '../tiere/freude';
import type { Sitzung } from '../nachfuellen/sitzung';
import './spiele.css';

/**
 * Kettenschritt, der einen Fehler meldet statt die ganze Kette zu beenden: fehlt z. B. ein fester
 * Satz, sieht Papa die Meldung, und die Geschichte geht trotzdem weiter.
 */
export function sicher(f: () => Promise<Ausgang | undefined>, melde: (f: unknown) => void): KettenSchritt {
  return () =>
    f().then(
      (a) => a ?? 'fertig',
      (fehler: unknown) => {
        melde(fehler);
        return 'fertig' as const;
      },
    );
}

/** Wartet auf `p`, höchstens `ms` (Schutz gegen eine hängende Sprachausgabe). Fehler zählen als Ende. */
export function hoechstens(s: Sitzung, p: Promise<unknown>, ms: number): Promise<void> {
  return new Promise((ok) => {
    s.warte(ms, ok);
    void p.then(
      () => ok(),
      () => ok(),
    );
  });
}

/**
 * Kleine Zeile für Eltern (Einstellung `elternzeilen`), sonst null. Deutlich als Elternhinweis
 * abgesetzt (Marke „Für Eltern“, kursiv, gestrichelte Linie darüber) — nicht antippbar, damit
 * sie nie wie ein Spielelement wirkt.
 */
export function elternzeile(ctx: Kontext, text: string): HTMLElement | null {
  if (!ctx.einstellungen.lese().elternzeilen) return null;
  return el(
    'p',
    { klasse: 'elternzeile', testid: 'elternzeile', attr: { 'aria-label': `Für Eltern: ${text}` } },
    el('span', { klasse: 'elternzeile__marke', attr: { 'aria-hidden': 'true' }, text: 'Für Eltern' }),
    el('span', { klasse: 'elternzeile__text', text }),
  );
}

/** Rundes Tierbild als Knopf; trägt `data-bewegung` (F4, wie im Tier-Modus aus `bewegungVon`). */
export function medaillonKnopf(
  bildUrl: string,
  tier: Tier,
  opt: { testid: string; klasse?: string; beiKlick: () => void },
): HTMLButtonElement {
  const bewegung = bewegungVon(tier);
  return el(
    'button',
    {
      klasse: ['spiel-medaillon', opt.klasse ?? ''].filter(Boolean),
      testid: opt.testid,
      attr: { 'data-bewegung': bewegung, 'aria-label': `${tier.artikel} ${tier.name}` },
      beiKlick: opt.beiKlick,
    },
    erzeugeMedaillon(bildUrl, `${tier.artikel} ${tier.name}`, { bewegung }),
  );
}

/**
 * Das Tier bewegt sich einmal in SEINER Bewegung (`data-bewegung` des Knopfs, F4). Bewegt wird
 * das Medaillon im Knopf — so kollidiert die Bewegung nicht mit einer Dauer-Animation am Knopf
 * (z. B. dem Wackeln des Problemtiers).
 */
export function bewegeTier(knopf: HTMLElement): void {
  const ziel = knopf.querySelector<HTMLElement>('.medaillon') ?? knopf;
  const b = knopf.dataset.bewegung;
  if (b && (BEWEGUNGEN as readonly string[]).includes(b)) bewege(ziel, b as Bewegung);
  else huepfe(ziel);
}

/** Kurzer Hüpfer (respektiert prefers-reduced-motion über CSS). */
export function huepfe(e: Element): void {
  animiere(e, 'spiel-huepft');
}

/** Großer, ruhig pulsierender Weiter-Knopf (kein Auto-Weiter). */
export function weiterKnopf(testid: string, text: string, beiKlick: () => void, bild: IconName = 'weiter'): HTMLButtonElement {
  return el(
    'button',
    { klasse: 'knopf knopf--gross knopf--icon spiel-weiter', testid, attr: { 'aria-label': text, title: text }, beiKlick },
    icon(bild, { groesse: 40, strich: 2.2 }),
  );
}

/** Hinweis mit Rückweg zum Start, wenn ein Spiel gerade nichts zum Spielen hat. */
export function leerHinweis(ctx: Kontext, text: string): HTMLElement {
  return el(
    'div',
    { klasse: 'hinweis stapel mitte', testid: 'spiel-leer' },
    el('p', { text }),
    el('button', { klasse: 'knopf', beiKlick: () => ctx.navigiere('start') }, icon('zurueck'), el('span', { text: 'Zum Start' })),
  );
}

/** Offene Felder und Tasten für `erzeugeStufenArbeit` (src/modi/tiere/stufenarbeit.ts). */
export interface WortAufgabe {
  offen: number[];
  tasten: Buchstabe[];
}

/**
 * Aufgabe für ein freies Wort (z. B. „mama“ bei Meine Leute) je Stufe (Konzept F1):
 * 1 nur der Anlaut offen, 2 Tasten · 2 Anlaut und letzter Buchstabe offen, 3 Tasten ·
 * 3 alle Felder offen, Buchstaben des Worts + 2 Ablenker · 4 alle Felder offen, volles Alphabet.
 * Ablenker kontrastieren (nie m/n, b/p/d …) und kommen möglichst aus `bekannt`.
 * Für Tiere gilt `stufenAufgabe` aus src/modi/tiere/auswahl.ts. Wirft bei fremden Zeichen.
 */
export function wortAufgabe(wort: string, stufe: TierStufe, bekannt: readonly Buchstabe[] = []): WortAufgabe {
  const b = buchstabenVon(wort);
  const erster = b[0];
  if (!erster) throw new Error('Das Wort ist leer.');
  const imWort = new Set(b);
  const vorrat = ANLAUT_LAUTE.filter((x) => !imWort.has(x));
  const sortiert = (menge: Iterable<Buchstabe>): Buchstabe[] => {
    const s = new Set(menge);
    return LAUTE.filter((x) => s.has(x));
  };
  const nurAnlaut = (): WortAufgabe => ({ offen: [0], tasten: sortiert([erster, ...waehleAblenker(erster, vorrat, 1, bekannt)]) });
  if (stufe === 1) return nurAnlaut();
  if (stufe === 2) {
    const letzter = b.length - 1;
    const ende = b[letzter];
    if (letzter < 1 || !ende) return nurAnlaut();
    const passend = vorrat.filter((x) => kontrastiert(x, ende));
    return { offen: [0, letzter], tasten: sortiert([erster, ende, ...waehleAblenker(erster, passend, 1, bekannt)]) };
  }
  const alle = b.map((_, i) => i);
  if (stufe === 3) return { offen: alle, tasten: sortiert([...imWort, ...waehleAblenker(erster, vorrat, 2, bekannt)]) };
  return { offen: alle, tasten: [...LAUTE] };
}
