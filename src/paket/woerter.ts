/** Hilfen rund um das Schreibwort eines Tiers (Bau „paket“). */
import { schreibwort } from '../kern/alphabet';
import type { Tier } from '../kern/vertrag';

/** Kanonisches Schreibwort eines Tiernamens: „Bär“ → „bär“ (wie überall in der App). */
export function kanonischesWort(name: string): string {
  return schreibwort(name);
}

/** Laute, die für Anfänger schwerer sind: Umlaute, ß und die Mehrbuchstaben-Laute ch/sch. */
const SCHWER = /[äöüß]|ch/;

/** true, wenn das Schreibwort nur einfache, lautgetreue Buchstaben enthält. */
export function istLautgetreu(wort: string): boolean {
  return !SCHWER.test(wort);
}

/**
 * Tiere vom leichtesten zum schwersten: zuerst kürzere Schreibwörter, bei gleicher
 * Länge die ohne ä/ö/ü/ß/ch/sch zuerst, dann alphabetisch. Die Eingabe bleibt unverändert.
 */
export function tiereNachSchwierigkeit<T extends Pick<Tier, 'name'>>(tiere: readonly T[]): T[] {
  return tiere
    .map((tier) => ({ tier, wort: kanonischesWort(tier.name) }))
    .sort(
      (a, b) =>
        Array.from(a.wort).length - Array.from(b.wort).length ||
        Number(!istLautgetreu(a.wort)) - Number(!istLautgetreu(b.wort)) ||
        a.wort.localeCompare(b.wort, 'de'),
    )
    .map((x) => x.tier);
}
