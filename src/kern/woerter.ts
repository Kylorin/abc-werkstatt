/** Wörterbuch-Store (Fundament) in IndexedDB über idb-keyval. */
import { createStore, get, set } from 'idb-keyval';
import { istBuchstabe, schreibwort } from './alphabet';
import { WortFehler, type WoerterDienst } from './vertrag';

/**
 * Startwörter beim allerersten Start. Bau „audio" vertont GENAU diese Liste vorab
 * (public/audio/woerter/<wort>.mp3, Schlüssel in manifest.woerter = Wort).
 * Kurz, lautgetreu, aus der Welt eines kleinen Kindes.
 */
export const STARTWOERTER: readonly string[] = [
  'mama', 'papa', 'oma', 'opa', 'ball', 'hund', 'katze', 'maus', 'igel', 'hase',
  'sonne', 'mond', 'baum', 'haus', 'auto', 'nase', 'hand', 'fisch', 'ente', 'kuh',
  'eis', 'ei', 'bär', 'löwe', 'käse', 'tür', 'apfel', 'brot', 'milch', 'buch',
];

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
      await set(ANGELEGT, true, store);
      return cache;
    }
    cache = (await get<string[]>(LISTE, store)) ?? [];
    return cache;
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
      return auswahl[Math.floor(Math.random() * auswahl.length)];
    },
    abonniere(fn) {
      abos.add(fn);
      return () => abos.delete(fn);
    },
  };
}
