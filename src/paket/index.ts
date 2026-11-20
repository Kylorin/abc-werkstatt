/**
 * Tier-Paket-Dienst (Bau „paket“). Format: docs/tier-paket.md, Vertrag: PaketDienst.
 *
 * Speicher: ein eigener IndexedDB-Store (idb-keyval) mit
 * - `pakete`                    → Record<id, TierPaket> (alle Metadaten in einem Wert)
 * - `['datei', paketId, pfad]`  → Blob mit passendem MIME-Typ (nur referenzierte Dateien)
 * - `papierkorb`                → zuletzt gelöschtes Paket (Metadaten; seine Dateien bleiben liegen)
 * Import und Löschen laufen in EINER Transaktion: entweder ist alles gespeichert oder nichts.
 *
 * Löschen ist rückholbar: das Paket wandert in den Papierkorb und verschwindet aus Liste und
 * Suche. Endgültig entfernt werden seine Dateien erst beim nächsten Löschen oder Import.
 */
import { createStore, get, promisifyRequest } from 'idb-keyval';
import { PaketFehler, type PaketDienst, type TierPaket, type TierTreffer } from '../kern/vertrag';
import { pruefeZip, referenzierteDateien, MAX_ENTPACKT_BYTES, type DateiArt } from './validierung';
import { kanonischesWort } from './woerter';
import { bitteUmDauerhaftenSpeicher } from '../kern/speicher';
import { verkleinereBild } from './verkleinern';

export { kanonischesWort, tiereNachSchwierigkeit, istLautgetreu, hatLautreinenAnfang } from './woerter';
export { pruefeZip, pruefePaketJson } from './validierung';
export { anlautBuchstabe, tiereMitAnlaut, kontrastiert, waehleAblenker } from './anlaut';
export { anlautTiere, lautreineAnlautTiere, silbenTiere, situationen } from './felder';
export { bewegungVon } from './bewegung';

const PAKETE = 'pakete';
const PAPIERKORB = 'papierkorb';
type Verzeichnis = Record<string, TierPaket>;
const dateiSchluessel = (paketId: string, pfad: string): IDBValidKey => ['datei', paketId, pfad];

export function erzeugePaketDienst(): PaketDienst {
  const store = createStore('abc-werkstatt-pakete', 'kv');
  const abos = new Set<() => void>();
  /** Blob-URLs je Paket und Pfad; als Promise, damit gleichzeitige Aufrufe dieselbe URL bekommen. */
  const urls = new Map<string, Map<string, Promise<string>>>();
  let cache: Verzeichnis | undefined;

  async function verzeichnis(): Promise<Verzeichnis> {
    if (cache) return cache;
    try {
      cache = (await get<Verzeichnis>(PAKETE, store)) ?? {};
    } catch (e) {
      throw new PaketFehler('Die Tier-Pakete konnten nicht gelesen werden (Gerätespeicher nicht verfügbar).', { cause: e });
    }
    return cache;
  }

  function melde(): void {
    for (const fn of abos) {
      try {
        fn();
      } catch (e) {
        // Ein fehlerhafter Abonnent darf die anderen nicht aufhalten – sichtbar loggen.
        console.error('Paket-Abonnent ist fehlgeschlagen', e);
      }
    }
  }

  function gibUrlsFrei(paketId: string): void {
    const je = urls.get(paketId);
    if (!je) return;
    urls.delete(paketId);
    for (const p of je.values()) {
      p.then((u) => URL.revokeObjectURL(u), () => undefined);
    }
  }

  async function papierkorb(): Promise<TierPaket | undefined> {
    try {
      return await get<TierPaket>(PAPIERKORB, store);
    } catch (e) {
      throw new PaketFehler('Der Papierkorb der Tier-Pakete konnte nicht gelesen werden.', { cause: e });
    }
  }

  /**
   * Schreibt Verzeichnis + Dateien und löscht alte Dateien in einer Transaktion.
   * `korb`: undefined = Papierkorb leeren, ein Paket = hineinlegen.
   */
  async function schreibe(
    neu: Verzeichnis,
    setzen: [IDBValidKey, Blob][],
    loeschen: IDBValidKey[],
    korb: TierPaket | undefined,
  ): Promise<void> {
    try {
      await store('readwrite', (s) => {
        for (const k of loeschen) s.delete(k);
        for (const [k, v] of setzen) s.put(v, k);
        s.put(neu, PAKETE);
        if (korb) s.put(korb, PAPIERKORB);
        else s.delete(PAPIERKORB);
        return promisifyRequest(s.transaction);
      });
    } catch (e) {
      cache = undefined; // Stand im Speicher nicht mehr sicher → beim nächsten Lesen neu laden.
      throw new PaketFehler('Das Paket konnte nicht auf dem Gerät gespeichert werden (Speicher voll?).', { cause: e });
    }
    cache = neu;
  }

  function alteDateien(alt: TierPaket | undefined): IDBValidKey[] {
    return alt ? [...referenzierteDateien(alt).keys()].map((p) => dateiSchluessel(alt.id, p)) : [];
  }

  async function url(paketId: string, pfad: string, art: DateiArt): Promise<string> {
    const paket = (await verzeichnis())[paketId];
    if (!paket) throw new PaketFehler(`Das Tier-Paket „${paketId}“ ist nicht installiert.`);
    const erwartet = referenzierteDateien(paket).get(pfad);
    if (erwartet !== art) {
      throw new PaketFehler(`„${pfad}“ ist ${art === 'bild' ? 'kein Bild' : 'keine Audiodatei'} im Paket „${paket.titel}“.`);
    }
    let je = urls.get(paketId);
    if (!je) urls.set(paketId, (je = new Map()));
    const vorhanden = je.get(pfad);
    if (vorhanden) return vorhanden;

    const versprechen = (async () => {
      let blob: Blob | undefined;
      try {
        blob = await get<Blob>(dateiSchluessel(paketId, pfad), store);
      } catch (e) {
        throw new PaketFehler(`„${pfad}“ konnte nicht gelesen werden.`, { cause: e });
      }
      if (!blob) throw new PaketFehler(`„${pfad}“ fehlt im gespeicherten Paket „${paket.titel}“. Bitte das Paket neu importieren.`);
      return URL.createObjectURL(blob);
    })();
    je.set(pfad, versprechen);
    versprechen.catch(() => {
      if (urls.get(paketId)?.get(pfad) === versprechen) urls.get(paketId)?.delete(pfad);
    });
    return versprechen;
  }

  return {
    async importiereZip(datei) {
      if (datei.size === 0) throw new PaketFehler('Die Datei ist leer.');
      if (datei.size > MAX_ENTPACKT_BYTES) {
        throw new PaketFehler('Die Datei ist größer als 100 MB und kann kein gültiges Tier-Paket sein.');
      }
      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await datei.arrayBuffer());
      } catch (e) {
        throw new PaketFehler('Die Datei konnte nicht gelesen werden.', { cause: e });
      }
      const { datei: inhalt, dateien } = pruefeZip(bytes);

      const alt = await verzeichnis();
      const paket: TierPaket = { ...inhalt, installiertAm: Date.now() };
      const neu: Verzeichnis = { ...alt, [paket.id]: paket };
      // B15: Rasterbilder auf ≈ 512 px verkleinern, bevor sie gespeichert werden.
      const setzen: [IDBValidKey, Blob][] = await Promise.all(
        dateien.map(async (d): Promise<[IDBValidKey, Blob]> => {
          const blob = new Blob([d.daten as Uint8Array<ArrayBuffer>], { type: d.typ });
          return [dateiSchluessel(paket.id, d.pfad), d.art === 'bild' ? await verkleinereBild(d.pfad, blob) : blob];
        }),
      );
      const neuePfade = new Set(dateien.map((d) => d.pfad));
      const vorher = alt[paket.id];
      const loeschen = vorher
        ? [...referenzierteDateien(vorher).keys()].filter((p) => !neuePfade.has(p)).map((p) => dateiSchluessel(paket.id, p))
        : [];
      // Ein Import leert den Papierkorb endgültig (Dateien gleicher Pfade schreibt `setzen` danach neu).
      const korb = await papierkorb();
      if (korb) loeschen.push(...alteDateien(korb));
      await schreibe(neu, setzen, loeschen, undefined);
      gibUrlsFrei(paket.id);
      melde();
      // Paket nicht dem Aufräumen des Browsers überlassen; das Ergebnis zeigen die Einstellungen.
      bitteUmDauerhaftenSpeicher().catch((f: unknown) => console.error('Dauerhafter Speicher nicht anfragbar', f));
      return paket;
    },

    async liste() {
      return Object.values(await verzeichnis()).sort(
        (a, b) => a.titel.localeCompare(b.titel, 'de') || a.id.localeCompare(b.id),
      );
    },

    async hole(id) {
      return (await verzeichnis())[id];
    },

    async loesche(id) {
      const alt = await verzeichnis();
      const paket = alt[id];
      if (!paket) return;
      const neu: Verzeichnis = { ...alt };
      delete neu[id];
      // Das bisher im Papierkorb liegende Paket wird jetzt endgültig entfernt, dieses kommt hinein.
      const korb = await papierkorb();
      await schreibe(neu, [], korb ? alteDateien(korb) : [], paket);
      gibUrlsFrei(id);
      melde();
    },

    async stelleWiederHer(id) {
      const korb = await papierkorb();
      if (!korb || korb.id !== id) {
        throw new PaketFehler('Dieses Tier-Paket lässt sich nicht mehr zurückholen. Bitte die Zip-Datei neu importieren.');
      }
      const alt = await verzeichnis();
      if (alt[id]) throw new PaketFehler(`Ein Paket „${alt[id].titel}“ ist schon installiert.`);
      await schreibe({ ...alt, [id]: korb }, [], [], undefined);
      melde();
      return korb;
    },

    bildUrl: (paketId, pfad) => url(paketId, pfad, 'bild'),
    audioUrl: (paketId, pfad) => url(paketId, pfad, 'audio'),

    async findeTier(wort): Promise<TierTreffer | undefined> {
      const gesucht = kanonischesWort(wort);
      if (!gesucht) return undefined;
      const pakete = Object.values(await verzeichnis()).sort((a, b) => b.installiertAm - a.installiertAm);
      for (const paket of pakete) {
        const tier = paket.tiere.find((t) => kanonischesWort(t.name) === gesucht);
        if (tier) return { paket, tier };
      }
      return undefined;
    },

    abonniere(fn) {
      abos.add(fn);
      return () => {
        abos.delete(fn);
      };
    },
  };
}
