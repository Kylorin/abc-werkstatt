/** Wörterbuch-Store (Fundament) in IndexedDB über idb-keyval. */
import { createStore, get, set } from 'idb-keyval';
import { istBuchstabe, schreibwort } from './alphabet';
import { WortFehler, type WoerterDienst } from './vertrag';

/**
 * Startwörter beim allerersten Start. Bau „audio" vertont diese Liste vorab
 * (public/audio/woerter/<wort>.mp3, Schlüssel in manifest.woerter = Wort).
 *
 * LAUTGETREU (Montessori): Die Laute der einzelnen Buchstaben ergeben zusammen das Wort —
 * nur Dauerlaute und offene Silben, keine Phonogramme (sch, ch, ei, au, eu, ie, pf, tz),
 * kein Dehnungs-h, keine Doppelkonsonanten, keine Umlaute. Diese kommen erst später.
 */
export const STARTWOERTER: readonly string[] = [
  'mama', 'papa', 'oma', 'opa', 'sofa', 'lama', 'limo', 'kino', 'uhu', 'ufo', 'mofa',
  'hut', 'rad', 'igel', 'nase', 'hase', 'hose', 'rose', 'dose', 'ofen', 'rabe', 'tomate',
];

/**
 * Die Startwörter der ersten Fassung. Auf Geräten, die damit angelegt wurden, werden die nicht
 * lautgetreuen davon einmalig fürs Üben pausiert (nicht gelöscht) — siehe `STAND_STARTWOERTER`.
 */
const STARTWOERTER_V1: readonly string[] = [
  'mama', 'papa', 'oma', 'opa', 'ball', 'hund', 'katze', 'maus', 'igel', 'hase',
  'sonne', 'mond', 'baum', 'haus', 'auto', 'nase', 'hand', 'fisch', 'ente', 'kuh',
  'eis', 'ei', 'bär', 'löwe', 'käse', 'tür', 'apfel', 'brot', 'milch', 'buch',
];
/** Nicht lautgetreue Wörter der ersten Fassung (Phonogramme, Dehnungs-h, Doppelkonsonant, Umlaut, Auslaut). */
const NICHT_LAUTGETREU_V1 = new Set(STARTWOERTER_V1.filter((w) => !STARTWOERTER.includes(w)));

/** Stand der Startwörter auf dem Gerät: 2 = lautgetreue Liste. */
const STAND = 'startwoerter-stand';
const STAND_AKTUELL = 2;

/**
 * Schwierigkeit eines Schreibworts für Anfänger (kleiner = leichter). Gilt für Nachfüllen und
 * Tier-Modus gleich: Länge, verschiedene Buchstaben, seltene Buchstaben, Phonogramme, Doppelte.
 */
export function wortSchwierigkeit(wort: string): number {
  const zeichen = Array.from(wort);
  const verschieden = new Set(zeichen).size;
  const besonders = zeichen.filter((z) => 'äöüßqxyc'.includes(z)).length;
  const verbindungen = (wort.match(/sch|ch|ck|qu|ei|eu|äu|au|ie|pf|tz/g) ?? []).length;
  const doppelt = (wort.match(/(.)\1/g) ?? []).length;
  return zeichen.length * 10 + verschieden * 2 + besonders * 6 + verbindungen * 4 + doppelt * 4;
}

/**
 * Wählt leicht vor schwer: Die Wörter werden nach Schwierigkeit geordnet, die leichteren kommen
 * deutlich öfter dran (Gewicht 0,75^Rang), schwerere nur gelegentlich — kein reiner Zufall.
 */
export function waehleNachSchwierigkeit(woerter: readonly string[], zufall: () => number = Math.random): string | undefined {
  const geordnet = [...woerter].sort((a, b) => wortSchwierigkeit(a) - wortSchwierigkeit(b) || a.localeCompare(b, 'de'));
  const gewichte = geordnet.map((_, i) => 0.75 ** i);
  let rest = zufall() * gewichte.reduce((s, g) => s + g, 0);
  for (let i = 0; i < geordnet.length; i++) {
    rest -= gewichte[i] ?? 0;
    if (rest < 0) return geordnet[i];
  }
  return geordnet[geordnet.length - 1];
}

const store = createStore('abc-werkstatt-woerter', 'kv');
const LISTE = 'liste';
const ANGELEGT = 'angelegt';
/** Fürs Üben abgewählte Wörter (string[]). */
const PAUSIERT = 'pausiert';

/** Normalisiert und prüft ein Wort; wirft WortFehler mit Elternmeldung. */
export function pruefeWort(eingabe: string): string {
  const w = schreibwort(eingabe);
  if (w.length < 2) throw new WortFehler('Bitte mindestens zwei Buchstaben eingeben.');
  if (w.length > 20) throw new WortFehler('Höchstens 20 Buchstaben, bitte.');
  const fremd = Array.from(w).filter((z) => !istBuchstabe(z));
  if (fremd.length) throw new WortFehler(`Nur Buchstaben a–z, ä, ö, ü, ß – nicht: ${[...new Set(fremd)].join(' ')}`);
  return w;
}

export function erzeugeWoerter(): WoerterDienst {
  const abos = new Set<() => void>();
  let cache: string[] | undefined;
  let pausiertCache: Set<string> | undefined;

  function melde(): void {
    for (const fn of abos) fn();
  }

  async function lade(): Promise<string[]> {
    if (cache) return cache;
    const angelegt = await get<boolean>(ANGELEGT, store);
    if (!angelegt) {
      cache = [...STARTWOERTER].sort((a, b) => a.localeCompare(b, 'de'));
      await set(LISTE, cache, store);
      await set(STAND, STAND_AKTUELL, store);
      await set(ANGELEGT, true, store);
      return cache;
    }
    cache = (await get<string[]>(LISTE, store)) ?? [];
    await aktualisiereStartwoerter(cache);
    return cache;
  }

  /**
   * Einmalig für Geräte mit der ersten Startliste: die neuen lautgetreuen Wörter ergänzen und die
   * nicht lautgetreuen alten Startwörter fürs Üben pausieren. Gelöscht wird nichts, die Eltern
   * können jedes Wort im Wörterbuch wieder anhaken.
   */
  async function aktualisiereStartwoerter(liste: string[]): Promise<void> {
    const stand = await get<unknown>(STAND, store);
    if (stand !== undefined && typeof stand !== 'number') throw new Error('Gespeicherter Stand der Startwörter ist beschädigt.');
    if ((stand ?? 1) >= STAND_AKTUELL) return;
    const neu = [...new Set([...liste, ...STARTWOERTER])].sort((a, b) => a.localeCompare(b, 'de'));
    const pausiert = new Set(await ladePausiert());
    for (const w of liste) if (NICHT_LAUTGETREU_V1.has(w)) pausiert.add(w);
    cache = neu;
    await set(LISTE, neu, store);
    await speicherePausiert(pausiert);
    await set(STAND, STAND_AKTUELL, store);
  }

  async function ladePausiert(): Promise<Set<string>> {
    if (pausiertCache) return pausiertCache;
    const roh = await get<unknown>(PAUSIERT, store);
    if (roh !== undefined && !Array.isArray(roh)) throw new Error('Gespeicherte Üben-Auswahl ist beschädigt.');
    pausiertCache = new Set((roh ?? []).filter((w): w is string => typeof w === 'string'));
    return pausiertCache;
  }

  async function speicherePausiert(menge: Set<string>): Promise<void> {
    pausiertCache = menge;
    await set(PAUSIERT, [...menge].sort((a, b) => a.localeCompare(b, 'de')), store);
  }

  async function speichere(liste: string[]): Promise<void> {
    cache = [...new Set(liste)].sort((a, b) => a.localeCompare(b, 'de'));
    await set(LISTE, cache, store);
    melde();
  }

  return {
    liste: async () => [...(await lade())],
    async hinzufuegen(wort) {
      const w = pruefeWort(wort);
      await speichere([...(await lade()), w]);
      return w;
    },
    async loeschen(wort) {
      const w = schreibwort(wort);
      const pausiert = await ladePausiert();
      if (pausiert.has(w)) {
        const rest = new Set(pausiert);
        rest.delete(w);
        await speicherePausiert(rest);
      }
      await speichere((await lade()).filter((x) => x !== w));
    },
    pausierte: async () => [...(await ladePausiert())].sort((a, b) => a.localeCompare(b, 'de')),
    async setzeUeben(wort, ueben) {
      const w = schreibwort(wort);
      const menge = new Set(await ladePausiert());
      if (ueben) menge.delete(w);
      else menge.add(w);
      await speicherePausiert(menge);
      melde();
    },
    async zufall(ausser) {
      const alle = await lade();
      if (!alle.length) return undefined;
      const pausiert = await ladePausiert();
      const aktive = alle.filter((w) => !pausiert.has(w));
      // Alle abgewählt: die Auswahl ist eine Vorliebe, keine Sperre — dann aus allen wählen.
      const basis = aktive.length ? aktive : alle;
      const auswahl = basis.length > 1 && ausser ? basis.filter((w) => w !== ausser) : basis;
      return waehleNachSchwierigkeit(auswahl);
    },
    abonniere(fn) {
      abos.add(fn);
      return () => abos.delete(fn);
    },
  };
}
