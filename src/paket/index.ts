/**
 * STUB — Bau „paket" ersetzt diese Datei (Export `erzeugePaketDienst` bleibt).
 * Vertrag: PaketDienst in src/kern/vertrag.ts, Format: docs/tier-paket.md.
 */
import { PaketFehler, type PaketDienst } from '../kern/vertrag';

export function erzeugePaketDienst(): PaketDienst {
  const fehlt = (): never => {
    throw new PaketFehler('Tier-Pakete sind noch nicht gebaut.');
  };
  return {
    importiereZip: async () => fehlt(),
    liste: async () => [],
    hole: async () => undefined,
    loesche: async () => {},
    bildUrl: async () => fehlt(),
    audioUrl: async () => fehlt(),
    findeTier: async () => undefined,
    abonniere: () => () => {},
  };
}
