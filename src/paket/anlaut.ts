/**
 * Anlaut-Hilfen (F0) — gemeinsam für Laut ruft Tier (F2), Erster Laut (F1), Decke (F3), Wer hilft? (F6).
 *
 * Regel (Konzept „Bewusst NICHT“): Der Anlaut wird NIE aus dem ersten Buchstaben abgeleitet. Ein
 * Tier ist Anlaut-Tier nur, wenn `tier.anlaut` genau EIN Buchstabe des Alphabets ist und zum ersten
 * Buchstaben des Schreibworts passt. Phonogramme („sch“, „ei“ …) und fehlende Felder fallen heraus.
 */
import { istBuchstabe, schreibwort } from '../kern/alphabet';
import type { AnlautTreffer, Buchstabe, Tier, TierPaket } from '../kern/vertrag';

/** Der gültige Einzel-Anlaut eines Tiers oder undefined. */
export function anlautBuchstabe(tier: Tier): Buchstabe | undefined {
  const a = tier.anlaut;
  if (!a || !istBuchstabe(a)) return undefined;
  return Array.from(schreibwort(tier.name))[0] === a ? a : undefined;
}

/**
 * Alle Anlaut-Tiere aller Pakete, je Buchstabe in fester Reihenfolge (Paket-Titel, dann Paket-
 * Reihenfolge). Fest, kein Zufall: F2 ruft beim erneuten Tipp das NÄCHSTE Tier dieser Liste.
 */
export function tiereMitAnlaut(pakete: readonly TierPaket[]): Map<Buchstabe, AnlautTreffer[]> {
  const m = new Map<Buchstabe, AnlautTreffer[]>();
  const sortiert = [...pakete].sort((a, b) => a.titel.localeCompare(b.titel, 'de'));
  for (const paket of sortiert) {
    for (const tier of paket.tiere) {
      const laut = anlautBuchstabe(tier);
      if (!laut) continue;
      const liste = m.get(laut) ?? [];
      liste.push({ paket, tier, laut });
      m.set(laut, liste);
    }
  }
  return m;
}

/** Gruppen, die nie nebeneinander als Wahl liegen dürfen (Konzept: m/n, b/p/d, f/w, Zischlaute). */
const AEHNLICH: readonly (readonly Buchstabe[])[] = [
  ['m', 'n'],
  ['b', 'p', 'd'],
  ['f', 'w', 'v'],
  ['s', 'z', 'ß', 'x'],
  ['g', 'k'],
  ['e', 'ä'],
  ['i', 'ü'],
  ['o', 'ö', 'u'],
];

/** true, wenn `a` und `b` gut unterscheidbar sind und als Paar (Laut + Ablenker) angeboten werden dürfen. */
export function kontrastiert(a: Buchstabe, b: Buchstabe): boolean {
  if (a === b) return false;
  return !AEHNLICH.some((g) => g.includes(a) && g.includes(b));
}

/**
 * Wählt `anzahl` Ablenker zu `laut` aus `vorrat`, die mit `laut` UND untereinander kontrastieren.
 * `bevorzugt` (z. B. dem Kind schon bekannte Buchstaben) kommt zuerst dran. Deterministisch bei
 * gleichem `zufall`. Wirft, wenn es nicht genug kontrastierende Buchstaben gibt.
 */
export function waehleAblenker(
  laut: Buchstabe,
  vorrat: readonly Buchstabe[],
  anzahl: number,
  bevorzugt: readonly Buchstabe[] = [],
  zufall: () => number = Math.random,
): Buchstabe[] {
  const gemischt = [...vorrat].sort(() => zufall() - 0.5);
  const reihenfolge = [...bevorzugt.filter((b) => vorrat.includes(b)), ...gemischt];
  const wahl: Buchstabe[] = [];
  for (const b of reihenfolge) {
    if (wahl.length >= anzahl) break;
    if (wahl.includes(b) || !kontrastiert(laut, b) || wahl.some((w) => !kontrastiert(w, b))) continue;
    wahl.push(b);
  }
  if (wahl.length < anzahl) throw new Error(`Zu „${laut}“ gibt es nicht genug gut unterscheidbare Buchstaben.`);
  return wahl;
}
