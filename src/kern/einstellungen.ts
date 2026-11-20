/** Einstellungs-Store (Fundament). Persistiert synchron in localStorage, damit der Start sofort richtig aussieht. */
import type { Einstellungen, EinstellungenStore } from './vertrag';

const SCHLUESSEL = 'abc-werkstatt:einstellungen:v1';

/** Montessori-Standard: Laute, Kleinbuchstaben, Vorlage im Tier-Modus. */
export const STANDARD_EINSTELLUNGEN: Readonly<Einstellungen> = Object.freeze({
  namenStattLaute: false,
  grossbuchstaben: false,
  azureRegion: 'germanywestcentral',
  stimme: 'de-DE-KatjaNeural',
  tierModusMitVorlage: true,
  gewaehlteLautVarianten: {},
});

function laden(speicher: Storage): Einstellungen {
  const roh = speicher.getItem(SCHLUESSEL);
  if (!roh) return { ...STANDARD_EINSTELLUNGEN, gewaehlteLautVarianten: {} };
  const gelesen = JSON.parse(roh) as Partial<Einstellungen>;
  return {
    ...STANDARD_EINSTELLUNGEN,
    ...gelesen,
    gewaehlteLautVarianten: { ...(gelesen.gewaehlteLautVarianten ?? {}) },
  };
}

/** Erzeugt den Store. `speicher` ist austauschbar (Standard localStorage). */
export function erzeugeEinstellungen(speicher: Storage = localStorage): EinstellungenStore {
  let stand = laden(speicher);
  const abos = new Set<(e: Einstellungen) => void>();
  return {
    lese: () => stand,
    setze(teil) {
      stand = { ...stand, ...teil };
      speicher.setItem(SCHLUESSEL, JSON.stringify(stand));
      for (const fn of abos) fn(stand);
    },
    abonniere(fn) {
      abos.add(fn);
      return () => abos.delete(fn);
    },
  };
}
