/**
 * Kleine gemeinsame Hilfen der Spiele F5–F7 (Bau „spiele“): Medaillon-Knöpfe, Elternzeile,
 * Sprechketten, die bei einem fehlenden Ton weiterlaufen (der Fehler wird sichtbar gemeldet).
 */
import { animiere, el } from '../../kern/dom';
import { icon, type IconName } from '../../kern/ui/icons';
import type { Ausgang, Kontext, KettenSchritt, Tier } from '../../kern/vertrag';
import { erzeugeMedaillon } from '../tiere/freude';
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

/** Kleine graue Zeile für Eltern (Einstellung `elternzeilen`), sonst null. */
export function elternzeile(ctx: Kontext, text: string): HTMLElement | null {
  if (!ctx.einstellungen.lese().elternzeilen) return null;
  return el('p', { klasse: 'elternzeile', testid: 'elternzeile', text });
}

/** Rundes Tierbild als Knopf; trägt `data-bewegung` (F4, ohne Feld: hüpft). */
export function medaillonKnopf(
  bildUrl: string,
  tier: Tier,
  opt: { testid: string; klasse?: string; beiKlick: () => void },
): HTMLButtonElement {
  return el(
    'button',
    {
      klasse: ['spiel-medaillon', opt.klasse ?? ''].filter(Boolean),
      testid: opt.testid,
      attr: { 'data-bewegung': tier.bewegung ?? 'huepft', 'aria-label': `${tier.artikel} ${tier.name}` },
      beiKlick: opt.beiKlick,
    },
    erzeugeMedaillon(bildUrl, `${tier.artikel} ${tier.name}`),
  );
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
