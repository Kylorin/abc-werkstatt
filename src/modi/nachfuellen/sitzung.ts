/**
 * Lebensdauer eines Modus-Auftritts (Bau „schreiben"): Timer und Aufräumarbeiten sammeln,
 * damit unmount() garantiert alles abmeldet — auch nach async-Lücken.
 */
import { el, fehlerHinweis } from '../../kern/dom';

export class Sitzung {
  lebt = true;
  private readonly aufgaben: (() => void)[] = [];

  /** Merkt sich eine Aufräumarbeit für beende(). */
  nachher(fn: () => void): void {
    if (!this.lebt) {
      fn();
      return;
    }
    this.aufgaben.push(fn);
  }

  /** setTimeout, der nach beende() nie mehr feuert. */
  warte(ms: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      if (this.lebt) fn();
    }, ms);
    this.nachher(() => window.clearTimeout(id));
  }

  /** Idempotent: räumt alles in umgekehrter Reihenfolge auf. */
  beende(): void {
    if (!this.lebt) return;
    this.lebt = false;
    for (const f of this.aufgaben.splice(0).reverse()) f();
  }
}

/**
 * Ruhiger Meldebereich für Eltern: echte Fehler (Audio kaputt, Paket fehlt) werden
 * sichtbar gemacht und geloggt, nie still geschluckt. Die jeweils neueste Meldung ersetzt die alte.
 */
export interface Meldung {
  el: HTMLElement;
  melde(fehler: unknown): void;
}

export function erzeugeMeldung(): Meldung {
  const bereich = el('div', { klasse: 'meldung', attr: { 'aria-live': 'polite' } });
  return {
    el: bereich,
    melde(fehler) {
      bereich.replaceChildren(fehlerHinweis(fehler));
    },
  };
}

/** Audio abspielen: Fehler gehen an die Meldung, das Ergebnis-Promise löst danach auf. */
export function spiele(p: Promise<void>, melde: (f: unknown) => void): Promise<void> {
  return p.catch((f: unknown) => melde(f));
}
