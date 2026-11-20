/** Reine Hilfsfunktionen rund um Buchstaben und Wörter (Fundament). */
import { LAUTE, VOKALE, type Buchstabe, type BuchstabenArt } from './vertrag';

const LAUT_MENGE: ReadonlySet<string> = new Set(LAUTE);

/** Ist `z` ein Buchstabe des beweglichen Alphabets (kanonisch klein)? */
export function istBuchstabe(z: string): z is Buchstabe {
  return LAUT_MENGE.has(z);
}

/** vokal | konsonant — für data-art und Farbe. */
export function artVon(b: Buchstabe): BuchstabenArt {
  return VOKALE.has(b) ? 'vokal' : 'konsonant';
}

/**
 * Anzeige eines Buchstabens. Großbuchstaben nur als Einstellung;
 * ß bleibt ß (toUpperCase würde „SS“ liefern).
 */
export function anzeigeZeichen(b: Buchstabe, gross: boolean): string {
  if (!gross || b === 'ß') return b;
  return b.toLocaleUpperCase('de-DE');
}

/** Kanonisches Schreibwort, z. B. „Bär“ → „bär“. Gilt für Tiernamen und Wörterbuch. */
export function schreibwort(text: string): string {
  return text.trim().toLocaleLowerCase('de-DE');
}

/** Zerlegt ein kanonisches Wort in Buchstaben; wirft, wenn ein Zeichen nicht im Alphabet ist. */
export function buchstabenVon(wort: string): Buchstabe[] {
  return Array.from(wort).map((z) => {
    if (!istBuchstabe(z)) throw new Error(`Zeichen „${z}“ gehört nicht zum Alphabet`);
    return z;
  });
}

/** Normalisiert einen Tastendruck (KeyboardEvent.key) auf einen Buchstaben oder null. */
export function buchstabeAusTaste(key: string): Buchstabe | null {
  if (key.length !== 1) return null;
  const k = key.toLocaleLowerCase('de-DE');
  return istBuchstabe(k) ? k : null;
}
