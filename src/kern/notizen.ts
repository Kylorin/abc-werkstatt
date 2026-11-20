/**
 * Sitzungsnotizen (B16 „heute dran“) — nur für Eltern, hinter der Sperre. Kein Zähler für das Kind.
 * Speichert die aktuelle Sitzung in localStorage; beim nächsten App-Start wird sie zur „letzten“.
 */
import type { Notiz, NotizDienst } from './vertrag';

const AKTUELL = 'abc-werkstatt:notizen:aktuell';
const LETZTE = 'abc-werkstatt:notizen:letzte';
const MAX = 40;

function lies(speicher: Storage, k: string): Notiz[] {
  const roh = speicher.getItem(k);
  if (!roh) return [];
  try {
    const w: unknown = JSON.parse(roh);
    return Array.isArray(w) ? (w as Notiz[]) : [];
  } catch (f) {
    console.error('Sitzungsnotizen beschädigt, werden verworfen.', f);
    return [];
  }
}

export function erzeugeNotizen(speicher: Storage = localStorage): NotizDienst {
  // App-Start: die vorige Sitzung wird zur „letzten“, wenn sie etwas enthielt.
  const vorige = lies(speicher, AKTUELL);
  if (vorige.length) speicher.setItem(LETZTE, JSON.stringify(vorige));
  speicher.removeItem(AKTUELL);
  let aktuell: Notiz[] = [];

  return {
    merke(n) {
      if (aktuell.some((a) => a.art === n.art && a.wert === n.wert)) return;
      aktuell = [...aktuell, n].slice(-MAX);
      speicher.setItem(AKTUELL, JSON.stringify(aktuell));
    },
    heuteDran() {
      return aktuell.length ? [...aktuell] : lies(speicher, LETZTE);
    },
  };
}
