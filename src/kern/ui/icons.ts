/**
 * Eigene Vektor-Icons im Lucide-Stil (24er Raster, Kontur, runde Enden, currentColor).
 * Keine Emojis in der Bedienung. Neue Icons hier ergänzen (Fundament) und in der Übergabe nennen.
 */

const PFADE = {
  /** Freies Schreiben: Stift mit Linie */
  frei: '<path d="M14.6 4.6a2.2 2.2 0 0 1 3.1 0l1.7 1.7a2.2 2.2 0 0 1 0 3.1L9 19.8l-4.9 1.1 1.1-4.9z"/><path d="M13 6.4l4.6 4.6"/><path d="M14 20.5h6.5"/>',
  /** Nachfüllen: zwei gelegte Felder, ein leeres, Buchstabe fällt hinein */
  nachfuellen: '<rect x="2.5" y="13.5" width="5.5" height="7" rx="1.6"/><rect x="9.25" y="13.5" width="5.5" height="7" rx="1.6"/><rect x="16" y="13.5" width="5.5" height="7" rx="1.6" stroke-dasharray="2.2 2"/><path d="M18.75 3.5v6"/><path d="M16.4 7.4l2.35 2.35 2.35-2.35"/>',
  /** Wörterbuch: offenes Buch */
  woerterbuch: '<path d="M12 6.5C10 5 7 4.4 3.5 4.8v13.9c3.5-.4 6.5.2 8.5 1.8 2-1.6 5-2.2 8.5-1.8V4.8C17 4.4 14 5 12 6.5z"/><path d="M12 6.5v14"/><path d="M6.5 9.2c1.3-.1 2.4.1 3.2.5"/><path d="M14.3 9.7c.8-.4 1.9-.6 3.2-.5"/>',
  /** Einstellungen: zwei Schieberegler */
  einstellungen: '<path d="M4 7.5h9"/><path d="M18 7.5h2"/><circle cx="15.5" cy="7.5" r="2.4"/><path d="M4 16.5h2.5"/><path d="M11.5 16.5H20"/><circle cx="9" cy="16.5" r="2.4"/>',
  /** Zurück: Pfeil nach links */
  zurueck: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  /** Tiere: Pfote */
  tiere: '<circle cx="6.2" cy="10.2" r="1.9"/><circle cx="10" cy="6" r="1.9"/><circle cx="14.6" cy="6.4" r="1.9"/><circle cx="18" cy="10.6" r="1.9"/><path d="M8.4 17.6c0-2.9 2-5.6 4.4-5.6s4.2 2.4 4.2 4.8c0 2-1.4 3.4-3.2 3.4-1 0-1.5-.5-2.4-.5-.8 0-1.4.6-2.2.6-.6 0-.8-.9-.8-2.7z"/>',
  /** Anhören */
  lautsprecher: '<path d="M4 9.6v4.8h3.4L12 18.6V5.4L7.4 9.6z"/><path d="M15.6 9.2a4 4 0 0 1 0 5.6"/><path d="M18.3 6.6a7.6 7.6 0 0 1 0 10.8"/>',
  /** Löschen (Mülleimer) */
  loeschen: '<path d="M4 7h16"/><path d="M9.5 7V4.6h5V7"/><path d="M6.4 7l.9 12.6a1.6 1.6 0 0 0 1.6 1.4h6.2a1.6 1.6 0 0 0 1.6-1.4L17.6 7"/><path d="M10.2 11v6"/><path d="M13.8 11v6"/>',
  /** Löschtaste (letzten Buchstaben weg) */
  rueckschritt: '<path d="M9.2 5.5H19a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9.2L3.5 12z"/><path d="M12.4 9.6l4.8 4.8"/><path d="M17.2 9.6l-4.8 4.8"/>',
  /** Leertaste */
  leertaste: '<path d="M4 10v3.5a1.5 1.5 0 0 0 1.5 1.5h13a1.5 1.5 0 0 0 1.5-1.5V10"/>',
  /** Hinzufügen */
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  /** Fertig/gewählt */
  haken: '<path d="M5 12.6l4.4 4.4L19 7.4"/>',
  /** Schließen */
  schliessen: '<path d="M6.5 6.5l11 11"/><path d="M17.5 6.5l-11 11"/>',
  /** Mikrofon */
  mikrofon: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0"/><path d="M12 18v2.5"/>',
  /** Aufnahme läuft / starten */
  aufnahme: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
  /** Abspielen */
  abspielen: '<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10-6.4a.8.8 0 0 0 0-1.4l-10-6.4A.8.8 0 0 0 8 5.6z"/>',
  /** Stopp */
  stopp: '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>',
  /** Paket hochladen/importieren */
  hochladen: '<path d="M12 15.5V4.5"/><path d="M7.8 8.4L12 4.2l4.2 4.2"/><path d="M4.5 14.5v3.5A2 2 0 0 0 6.5 20h11a2 2 0 0 0 2-2v-3.5"/>',
  /** Paket (Schachtel) */
  paket: '<path d="M3.8 7.6L12 3.5l8.2 4.1v8.8L12 20.5l-8.2-4.1z"/><path d="M3.8 7.6L12 11.7l8.2-4.1"/><path d="M12 11.7v8.8"/><path d="M7.9 5.55l8.2 4.1"/>',
  /** Herz (Freude) */
  herz: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>',
  /** Laut-Studio: Schallwelle */
  welle: '<path d="M3.5 12h1.5"/><path d="M7.5 8.5v7"/><path d="M11 5v14"/><path d="M14.5 8v8"/><path d="M18 10v4"/><path d="M21 12h-.5"/>',
  /** Nochmal hören / wiederholen */
  nochmal: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
  /** Weiter */
  weiter: '<path d="M9.5 5.5L16 12l-6.5 6.5"/>',
} as const;

/** Name eines Icons aus dem Satz oben. */
export type IconName = keyof typeof PFADE;

/** Alle verfügbaren Icon-Namen (z. B. für eine Übersicht). */
export const ICON_NAMEN = Object.keys(PFADE) as IconName[];

export interface IconOptionen {
  /** Kantenlänge in px (Standard 24; per CSS über .icon überschreibbar). */
  groesse?: number;
  /** Zusätzliche CSS-Klasse. */
  klasse?: string;
  /** Strichstärke (Standard 1.8). */
  strich?: number;
  /** Zugänglicher Name; ohne Angabe ist das Icon aria-hidden (Text daneben trägt den Namen). */
  titel?: string;
}

/** SVG-Markup als String (z. B. für innerHTML). */
export function iconSvg(name: IconName, opt: IconOptionen = {}): string {
  const g = opt.groesse ?? 24;
  const klasse = ['icon', `icon--${name}`, opt.klasse].filter(Boolean).join(' ');
  const aria = opt.titel ? `role="img" aria-label="${opt.titel}"` : 'aria-hidden="true"';
  return `<svg class="${klasse}" xmlns="http://www.w3.org/2000/svg" width="${g}" height="${g}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${opt.strich ?? 1.8}" stroke-linecap="round" stroke-linejoin="round" focusable="false" ${aria}>${PFADE[name]}</svg>`;
}

/** Icon als DOM-Element. */
export function icon(name: IconName, opt: IconOptionen = {}): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name, opt);
  return t.content.firstElementChild as SVGSVGElement;
}
