/** Einstellungs-Store (Fundament). Persistiert synchron in localStorage, damit der Start sofort richtig aussieht. */
import { istBuchstabe } from './alphabet';
import {
  REGAL_ARBEITEN,
  type Buchstabe,
  type Einstellungen,
  type EinstellungenStore,
  type LiveStimme,
  type ModusId,
  type Spracheingabe,
} from './vertrag';

const SCHLUESSEL = 'abc-werkstatt:einstellungen:v1';

/**
 * Standard-Regal für die Stufen A–C (Konzept Abschnitt 2): Laut ruft Tier, Tiere (Stufe 1),
 * Decke und Silben. Freies Schreiben mit vollem Alphabet und Nachfüllen stehen anfangs NICHT im Regal.
 */
export const STANDARD_REGAL: readonly ModusId[] = ['laut-ruft-tier', 'tiere', 'decke', 'silben'];

/** Montessori-Standard: Laute, Kleinbuchstaben, Vorlage, Stufe 1, Hilfe nach 2 Versuchen. */
export const STANDARD_EINSTELLUNGEN: Readonly<Einstellungen> = Object.freeze({
  namenStattLaute: false,
  grossbuchstaben: false,
  tierModusMitVorlage: true,
  gewaehlteLautVarianten: {},
  elternsperre: true,
  regal: [...STANDARD_REGAL],
  tierStufe: 1,
  hilfeNach: 2,
  rundenBisGuteNacht: 6,
  lautRuftTier: true,
  kastenBuchstaben: [],
  deckeStufe: 0,
  geschichtenSchreiben: true,
  elternzeilen: true,
  liveStimme: 'browser',
  spracheingabe: 'aus',
});

/** Felder früherer Fassungen, die still verworfen werden (Azure ist raus). */
const ALTLAST = ['azureSchluessel', 'azureRegion', 'stimme'] as const;

const LIVE: readonly LiveStimme[] = ['browser', 'piper', 'openrouter'];
const EINGABE: readonly Spracheingabe[] = ['aus', 'browser', 'openrouter'];

function ganzzahl(w: unknown, min: number, max: number, standard: number): number {
  return typeof w === 'number' && Number.isInteger(w) && w >= min && w <= max ? w : standard;
}

/**
 * Bringt einen gespeicherten (evtl. alten oder beschädigten) Stand in die aktuelle Form:
 * Altlasten (Azure) fallen weg, unbekannte Werte werden durch den Standard ersetzt,
 * Laut-Studio-Wahlen der früheren Live-Stimme (`azure:<b>`) werden vergessen.
 */
export function migriere(roh: Record<string, unknown>): Einstellungen {
  const g = { ...roh };
  for (const k of ALTLAST) delete g[k];
  const s = STANDARD_EINSTELLUNGEN;

  const varianten: Partial<Record<Buchstabe, string>> = {};
  const vRoh = g['gewaehlteLautVarianten'];
  if (vRoh && typeof vRoh === 'object') {
    for (const [b, url] of Object.entries(vRoh as Record<string, unknown>)) {
      if (istBuchstabe(b) && typeof url === 'string' && !url.startsWith('azure:')) varianten[b] = url;
    }
  }

  const regalRoh = g['regal'];
  const regal = Array.isArray(regalRoh)
    ? regalRoh.filter((m): m is ModusId => typeof m === 'string' && (REGAL_ARBEITEN as readonly string[]).includes(m))
    : [...s.regal];

  const kastenRoh = g['kastenBuchstaben'];
  const kasten = Array.isArray(kastenRoh) ? kastenRoh.filter((b): b is Buchstabe => typeof b === 'string' && istBuchstabe(b)) : [];

  const anfang = g['kindAnfang'];
  const bool = (k: keyof Einstellungen, standard: boolean): boolean => (typeof g[k] === 'boolean' ? (g[k] as boolean) : standard);

  const e: Einstellungen = {
    namenStattLaute: bool('namenStattLaute', s.namenStattLaute),
    grossbuchstaben: bool('grossbuchstaben', s.grossbuchstaben),
    tierModusMitVorlage: bool('tierModusMitVorlage', s.tierModusMitVorlage),
    gewaehlteLautVarianten: varianten,
    elternsperre: bool('elternsperre', s.elternsperre),
    regal: [...new Set(regal)],
    tierStufe: ganzzahl(g['tierStufe'], 1, 4, s.tierStufe) as Einstellungen['tierStufe'],
    hilfeNach: ganzzahl(g['hilfeNach'], 1, 9, s.hilfeNach),
    rundenBisGuteNacht: ganzzahl(g['rundenBisGuteNacht'], 1, 50, s.rundenBisGuteNacht),
    lautRuftTier: bool('lautRuftTier', s.lautRuftTier),
    kastenBuchstaben: [...new Set(kasten)],
    deckeStufe: ganzzahl(g['deckeStufe'], 0, 1, s.deckeStufe) as Einstellungen['deckeStufe'],
    geschichtenSchreiben: bool('geschichtenSchreiben', s.geschichtenSchreiben),
    elternzeilen: bool('elternzeilen', s.elternzeilen),
    liveStimme: LIVE.includes(g['liveStimme'] as LiveStimme) ? (g['liveStimme'] as LiveStimme) : s.liveStimme,
    spracheingabe: EINGABE.includes(g['spracheingabe'] as Spracheingabe) ? (g['spracheingabe'] as Spracheingabe) : s.spracheingabe,
  };
  if (typeof g['kindName'] === 'string' && g['kindName']) e.kindName = g['kindName'];
  if (typeof anfang === 'string' && istBuchstabe(anfang)) e.kindAnfang = anfang;
  if (typeof g['openrouterSchluessel'] === 'string' && g['openrouterSchluessel']) e.openrouterSchluessel = g['openrouterSchluessel'];
  return e;
}

function laden(speicher: Storage): Einstellungen {
  const roh = speicher.getItem(SCHLUESSEL);
  if (!roh) return migriere({});
  let gelesen: unknown;
  try {
    gelesen = JSON.parse(roh);
  } catch (f) {
    // Beschädigter Stand: sichtbar loggen und mit Standardwerten weiter — das Kind soll nicht vor einem Fehler sitzen.
    console.error('Gespeicherte Einstellungen sind kein gültiges JSON und werden zurückgesetzt.', f);
    return migriere({});
  }
  const e = migriere(gelesen && typeof gelesen === 'object' ? (gelesen as Record<string, unknown>) : {});
  // Altlasten sofort entfernen (z. B. ein früher gespeicherter Azure-Schlüssel bleibt nicht liegen).
  speicher.setItem(SCHLUESSEL, JSON.stringify(e));
  return e;
}

/** Erzeugt den Store. `speicher` ist austauschbar (Standard localStorage). */
export function erzeugeEinstellungen(speicher: Storage = localStorage): EinstellungenStore {
  let stand = laden(speicher);
  const abos = new Set<(e: Einstellungen) => void>();
  return {
    lese: () => stand,
    setze(teil) {
      stand = { ...stand, ...teil };
      // Optionale Felder, die auf undefined gesetzt werden, verschwinden ganz.
      for (const [k, v] of Object.entries(stand)) if (v === undefined) delete (stand as unknown as Record<string, unknown>)[k];
      speicher.setItem(SCHLUESSEL, JSON.stringify(stand));
      for (const fn of abos) fn(stand);
    },
    abonniere(fn) {
      abos.add(fn);
      return () => abos.delete(fn);
    },
  };
}
