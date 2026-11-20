/**
 * Elternsperre (Fundament): Wörterbuch und Einstellungen öffnen sich in der installierten App erst
 * nach langem Drücken. Ein Kleinkind tippt kurz — so kommt es nicht an Schlüssel, Paket-Löschen
 * und Schalter. Im normalen Browser-Tab (auch in den Abnahmetests) gilt die Sperre nicht, denn dort
 * bedient ohnehin ein Erwachsener; abschalten lässt sie sich in den Einstellungen.
 */
import { el } from './dom';
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
  let timer: number | undefined;
  let geoeffnet = false;
  const stopp = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    delete knopf.dataset.halten;
  };
  knopf.classList.add('knopf--halten');
  knopf.style.setProperty('--halten-dauer', `${HALTEN_MS}ms`);
  knopf.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    stopp();
    geoeffnet = false;
    knopf.dataset.halten = 'laeuft';
    timer = window.setTimeout(() => {
      timer = undefined;
      geoeffnet = true;
      delete knopf.dataset.halten;
      oeffne();
    }, HALTEN_MS);
  });
  for (const ende of ['pointerup', 'pointerleave', 'pointercancel'] as const) knopf.addEventListener(ende, stopp);
  knopf.addEventListener('contextmenu', (ev) => ev.preventDefault());
  knopf.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (ev.detail === 0) {
      oeffne();
      return;
    }
    if (!geoeffnet) {
      hinweis.textContent = `Für Eltern: ${ELTERNSPERRE_SEKUNDEN} Sekunden gedrückt halten.`;
      hinweis.hidden = false;
    }
  });
}

/** Leiser Hinweis unter dem Elternbereich (zunächst versteckt). */
export function erzeugeSperrHinweis(): HTMLElement {
  return el('p', { klasse: 'start__sperrhinweis', attr: { hidden: true, 'aria-live': 'polite' } });
}
