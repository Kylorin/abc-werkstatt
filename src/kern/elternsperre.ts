/**
 * Elternsperre (Fundament): Wörterbuch und Einstellungen öffnen sich in der installierten App erst
 * nach langem Drücken. Ein Kleinkind tippt kurz — so kommt es nicht an Schlüssel, Paket-Löschen
 * und Schalter. Im normalen Browser-Tab (auch in den Abnahmetests) gilt die Sperre nicht, denn dort
 * bedient ohnehin ein Erwachsener; abschalten lässt sie sich in den Einstellungen.
 */
import { el } from './dom';
import { mitHalten } from './halten';
import type { EinstellungenStore } from './vertrag';

export const ELTERNSPERRE_SEKUNDEN = 2;
const HALTEN_MS = ELTERNSPERRE_SEKUNDEN * 1000;

/** Läuft die App als installierte App (Startbildschirm/Vollbild)? */
export function istInstalliert(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    nav.standalone === true
  );
}

export function sperreAktiv(einstellungen: EinstellungenStore): boolean {
  return einstellungen.lese().elternsperre && istInstalliert();
}

/**
 * Macht aus einem Knopf einen „Gedrückt halten“-Knopf: erst nach HALTEN_MS ruft er `oeffne`.
 * Ein kurzer Tipp zeigt nur den Hinweis. Tastatur (Enter/Leertaste, click.detail === 0) öffnet direkt.
 */
export function mitElternsperre(knopf: HTMLButtonElement, hinweis: HTMLElement, oeffne: () => void): void {
  mitHalten(knopf, {
    ms: HALTEN_MS,
    beiHalten: oeffne,
    beiKurz: () => {
      hinweis.textContent = `Für Eltern: ${ELTERNSPERRE_SEKUNDEN} Sekunden gedrückt halten.`;
      hinweis.hidden = false;
    },
  });
}

/** Leiser Hinweis unter dem Elternbereich (zunächst versteckt). */
export function erzeugeSperrHinweis(): HTMLElement {
  return el('p', { klasse: 'start__sperrhinweis', attr: { hidden: true, 'aria-live': 'polite' } });
}
