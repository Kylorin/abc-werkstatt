/** Hilfen rund um das Schreibwort eines Tiers (Bau „paket“, B4 „Schwierigkeit nach Lauttreue“). */
import { schreibwort } from '../kern/alphabet';
import type { Tier } from '../kern/vertrag';

/** Kanonisches Schreibwort eines Tiernamens: „Bär“ → „bär“ (wie überall in der App). */
export function kanonischesWort(name: string): string {
  return schreibwort(name);
}

/**
 * Anfänge, die für Anfänger schwer sind (B4): Phonogramme und Konsonantenhäufungen, bei denen der
 * erste Buchstabe nicht der erste Laut ist (sch, sp/st = „schp“/„scht“, ei, eu, au, ie, pf, v als f, qu).
 */
const SCHWERER_ANFANG = /^(sch|sp|st|ei|eu|äu|au|ie|pf|qu|v)/;

/** Laute, die für Anfänger schwerer sind: Umlaute, ß, ch/sch irgendwo im Wort und ein schwerer Anfang. */
const SCHWER = /[äöüß]|ch|^(ei|eu|äu|au|ie|sp|st|pf|qu)/;

/** true, wenn das Schreibwort nur einfache, lautgetreue Buchstaben enthält (auch am Anfang). */
export function istLautgetreu(wort: string): boolean {
  return !SCHWER.test(wort);
}

/** true, wenn der erste Buchstabe auch der erste Laut ist (kein sch, sp, st, ei, eu, au, ie, pf, qu, v am Anfang). */
export function hatLautreinenAnfang(wort: string): boolean {
  return !SCHWERER_ANFANG.test(wort);
}

/**
 * Tiere vom leichtesten zum schwersten (B4): Namen mit schwerem Anfang (Phonogramm oder
 * Konsonantenhäufung) ganz ans Ende, sonst zuerst kürzere Schreibwörter, bei gleicher Länge die
 * lautgetreuen zuerst, dann alphabetisch. Die Eingabe bleibt unverändert.
 */
export function tiereNachSchwierigkeit<T extends Pick<Tier, 'name'>>(tiere: readonly T[]): T[] {
  return tiere
    .map((tier) => ({ tier, wort: kanonischesWort(tier.name) }))
    .sort(
      (a, b) =>
        Number(!hatLautreinenAnfang(a.wort)) - Number(!hatLautreinenAnfang(b.wort)) ||
        Array.from(a.wort).length - Array.from(b.wort).length ||
        Number(!istLautgetreu(a.wort)) - Number(!istLautgetreu(b.wort)) ||
        a.wort.localeCompare(b.wort, 'de'),
    )
    .map((x) => x.tier);
}
