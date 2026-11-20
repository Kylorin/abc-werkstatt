/**
 * Aussprache je Buchstabe als IPA — dieselben Werte wie tools/vertonen.py.
 * Gebraucht für die Live-Vertonung über Azure, wenn eine vorab vertonte Datei fehlt
 * (z. B. Laut-Variante „azure" im Laut-Studio).
 */
import type { Buchstabe } from '../kern/vertrag';

/** Laut („mmm"): Dauerlaute gedehnt, Plosive kurz ohne Schwa. */
export const LAUT_IPA: Readonly<Record<Buchstabe, string>> = {
  a: 'aː', e: 'eː', i: 'iː', o: 'oː', u: 'uː',
  ä: 'ɛː', ö: 'øː', ü: 'yː', y: 'yː',
  b: 'b', c: 'k', d: 'd', g: 'ɡ', k: 'k', p: 'p', t: 't',
  q: 'kv', x: 'ks', z: 'ts',
  f: 'fː', v: 'fː', w: 'vː', s: 'sː', ß: 'sː',
  m: 'mː', n: 'nː', l: 'lː', r: 'ʁː', j: 'jː', h: 'hː',
};

/** Plosive: werden nicht verlangsamt (sonst entsteht ein Schwa). */
export const PLOSIVE: ReadonlySet<Buchstabe> = new Set<Buchstabe>(['b', 'c', 'd', 'g', 'k', 'p', 't', 'q', 'x', 'z', 'h']);

/** Deutscher Buchstabenname („be", „zett"). */
export const NAME_IPA: Readonly<Record<Buchstabe, string>> = {
  a: 'aː', b: 'beː', c: 'tseː', d: 'deː', e: 'eː', f: 'ɛf', g: 'ɡeː',
  h: 'haː', i: 'iː', j: 'jɔt', k: 'kaː', l: 'ɛl', m: 'ɛm', n: 'ɛn',
  o: 'oː', p: 'peː', q: 'kuː', r: 'ɛʁ', s: 'ɛs', t: 'teː', u: 'uː',
  v: 'faʊ', w: 'veː', x: 'ɪks', y: 'ʏpsilɔn', z: 'tsɛt',
  ä: 'ɛː', ö: 'øː', ü: 'yː', ß: 'ɛsˈtsɛt',
};

/** XML-Sonderzeichen maskieren (für Text und Attributwerte in SSML). */
export function xml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** SSML-Inhalt (innerhalb von <voice>) für einen Laut. */
export function lautSsml(b: Buchstabe): string {
  const ph = `<phoneme alphabet="ipa" ph="${xml(LAUT_IPA[b])}">${xml(b)}</phoneme>`;
  return PLOSIVE.has(b) ? ph : `<prosody rate="-50%">${ph}</prosody>`;
}

/** SSML-Inhalt für einen Buchstabennamen. */
export function nameSsml(b: Buchstabe): string {
  return `<phoneme alphabet="ipa" ph="${xml(NAME_IPA[b])}">${xml(b)}</phoneme>`;
}

/** SSML-Inhalt für Wort oder Satz (ruhig, leicht verlangsamt bei Sätzen). */
export function textSsml(text: string, satz: boolean): string {
  return satz ? `<prosody rate="-10%">${xml(text)}</prosody>` : xml(text);
}
