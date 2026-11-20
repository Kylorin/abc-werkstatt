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

  async function speichere(liste: string[]): Promise<void> {
    cache = [...new Set(liste)].sort((a, b) => a.localeCompare(b, 'de'));
    await set(LISTE, cache, store);
    for (const fn of abos) fn();
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
      await speichere((await lade()).filter((x) => x !== w));
    },
    async zufall(ausser) {
      const alle = await lade();
      if (!alle.length) return undefined;
      const auswahl = alle.length > 1 && ausser ? alle.filter((w) => w !== ausser) : alle;
      return auswahl[Math.floor(Math.random() * auswahl.length)];
    },
    abonniere(fn) {
      abos.add(fn);
      return () => abos.delete(fn);
    },
  };
}
