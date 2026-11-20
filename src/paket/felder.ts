/**
 * F0: die optionalen Paketfelder für die Spiele bereitstellen. Jede Abfrage nimmt nur Tiere, die
 * das Feld wirklich haben — fehlt es, spielt das Tier in diesem Spiel nicht mit (nie raten).
 */
import { anlautBuchstabe } from './anlaut';
import { kanonischesWort, hatLautreinenAnfang, istLautgetreu } from './woerter';
import type { AnlautTreffer, SituationTreffer, TierPaket, TierTreffer } from '../kern/vertrag';

/** Anlaut-Tiere eines Pakets (gültiger Einzel-Anlaut), in Paket-Reihenfolge. */
export function anlautTiere(paket: TierPaket): AnlautTreffer[] {
  const aus: AnlautTreffer[] = [];
  for (const tier of paket.tiere) {
    const laut = anlautBuchstabe(tier);
    if (laut) aus.push({ paket, tier, laut });
  }
  return aus;
}

/** Anlaut-Tiere mit lautgetreuem Schreibwort und lautreinem Anfang — die Auswahl für die ersten Stufen (F1 Stufe 1–2, F3). */
export function lautreineAnlautTiere(paket: TierPaket): AnlautTreffer[] {
  return anlautTiere(paket).filter((t) => {
    const wort = kanonischesWort(t.tier.name);
    return istLautgetreu(wort) && hatLautreinenAnfang(wort);
  });
}

/** Tiere mit Silben UND passendem Silben-Audio (F5). */
export function silbenTiere(paket: TierPaket): TierTreffer[] {
  return paket.tiere
    .filter((t) => (t.silben?.length ?? 0) > 0 && t.audio?.silben?.length === t.silben?.length)
    .map((tier) => ({ paket, tier }));
}

/** Alle Situationen aller Pakete mit aufgelöstem Helfer (F6). Der Validator garantiert, dass es den Helfer gibt. */
export function situationen(pakete: readonly TierPaket[]): SituationTreffer[] {
  const aus: SituationTreffer[] = [];
  for (const paket of pakete) {
    for (const problemtier of paket.tiere) {
      for (const situation of problemtier.situationen ?? []) {
        const helfer = paket.tiere.find((t) => t.id === situation.helfer);
        if (helfer) aus.push({ paket, problemtier, helfer, situation });
      }
    }
  }
  return aus;
}
