/**
 * „Meine Leute“ (F7) — Store der Familienwörter mit Foto und Elternaufnahme.
 *
 * Alles liegt NUR in IndexedDB (eigener Store), kommt in keinen Export und in kein Paket.
 * Fotos werden beim Speichern auf höchstens 512 px verkleinert (webp, sonst jpeg).
 */
import { createStore, del, get, set } from 'idb-keyval';
import { istBuchstabe, schreibwort } from './alphabet';
import { LEUTE_MAX, LeuteFehler, WortFehler, type LeuteDienst, type Person, type PersonEingabe } from './vertrag';

const LISTE = 'liste';
const FOTO_PX = 512;

/** Prüft und normalisiert ein Familienwort (wie im Wörterbuch: nur Buchstaben aus LAUTE, 2–20). */
export function pruefeLeuteWort(roh: string): string {
  const w = schreibwort(roh);
  const z = Array.from(w);
  if (z.length < 2 || z.length > 20) throw new WortFehler('Das Wort muss 2 bis 20 Buchstaben haben.');
  const fremd = [...new Set(z.filter((c) => !istBuchstabe(c)))];
  if (fremd.length) throw new WortFehler(`Nur Buchstaben des Alphabets, nicht: ${fremd.join(' ')}`);
  return w;
}

/** Verkleinert ein Bild auf höchstens FOTO_PX (längste Kante). Wirft `LeuteFehler`, wenn es kein Bild ist. */
async function verkleinere(foto: Blob): Promise<Blob> {
  const url = URL.createObjectURL(foto);
  try {
    const bild = new Image();
    bild.decoding = 'async';
    bild.src = url;
    try {
      await bild.decode();
    } catch (f) {
      throw new LeuteFehler('Das Foto ließ sich nicht öffnen.', { cause: f });
    }
    const w = bild.naturalWidth || FOTO_PX;
    const h = bild.naturalHeight || FOTO_PX;
    const f = Math.min(1, FOTO_PX / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * f));
    canvas.height = Math.max(1, Math.round(h * f));
    const g = canvas.getContext('2d');
    if (!g) throw new LeuteFehler('Das Foto ließ sich nicht verkleinern (kein Canvas).');
    g.drawImage(bild, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/webp', 0.85));
    if (blob) return blob;
    const jpeg = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!jpeg) throw new LeuteFehler('Das Foto ließ sich nicht speichern.');
    return jpeg;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function erzeugeLeute(): LeuteDienst {
  const store = createStore('abc-werkstatt-leute', 'kv');
  const abos = new Set<() => void>();
  const urls = new Map<string, Promise<string>>();

  async function liste(): Promise<Person[]> {
    try {
      return (await get<Person[]>(LISTE, store)) ?? [];
    } catch (f) {
      throw new LeuteFehler('„Meine Leute“ konnten nicht gelesen werden (Gerätespeicher nicht verfügbar).', { cause: f });
    }
  }

  function melde(): void {
    for (const fn of abos) {
      try {
        fn();
      } catch (f) {
        console.error('Leute-Abonnent ist fehlgeschlagen', f);
      }
    }
  }

  function vergissUrls(id: string): void {
    for (const art of ['foto', 'aufnahme']) {
      const k = `${art}:${id}`;
      const p = urls.get(k);
      urls.delete(k);
      p?.then((u) => URL.revokeObjectURL(u), () => undefined);
    }
  }

  async function blobUrl(art: 'foto' | 'aufnahme', id: string): Promise<string | undefined> {
    const k = `${art}:${id}`;
    const schon = urls.get(k);
    if (schon) return schon;
    const blob = await get<Blob>([art, id], store);
    if (!blob) return undefined;
    const p = Promise.resolve(URL.createObjectURL(blob));
    urls.set(k, p);
    return p;
  }

  return {
    liste,
    async hole(id) {
      return (await liste()).find((p) => p.id === id);
    },
    async anlegen(e: PersonEingabe) {
      const alle = await liste();
      if (alle.length >= LEUTE_MAX) throw new LeuteFehler(`Es gehen höchstens ${LEUTE_MAX} Personen.`);
      const wort = pruefeLeuteWort(e.wort);
      const foto = await verkleinere(e.foto);
      const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
      const person: Person = { id, wort, hatAufnahme: Boolean(e.aufnahme), angelegtAm: Date.now() };
      if (e.kind) person.kind = true;
      await set(['foto', id], foto, store);
      if (e.aufnahme) await set(['aufnahme', id], e.aufnahme, store);
      await set(LISTE, [...alle, person], store);
      melde();
      return person;
    },
    async aendern(id, teil) {
      const alle = await liste();
      const alt = alle.find((p) => p.id === id);
      if (!alt) throw new LeuteFehler('Diese Person gibt es nicht mehr.');
      const neu: Person = { ...alt };
      if (teil.wort !== undefined) neu.wort = pruefeLeuteWort(teil.wort);
      if (teil.kind !== undefined) neu.kind = teil.kind || undefined;
      if (teil.foto) await set(['foto', id], await verkleinere(teil.foto), store);
      if (teil.aufnahme) {
        await set(['aufnahme', id], teil.aufnahme, store);
        neu.hatAufnahme = true;
      }
      vergissUrls(id);
      await set(LISTE, alle.map((p) => (p.id === id ? neu : p)), store);
      melde();
      return neu;
    },
    async loeschen(id) {
      const alle = await liste();
      await set(LISTE, alle.filter((p) => p.id !== id), store);
      await del(['foto', id], store);
      await del(['aufnahme', id], store);
      vergissUrls(id);
      melde();
    },
    async fotoUrl(id) {
      const u = await blobUrl('foto', id);
      if (!u) throw new LeuteFehler('Das Foto dieser Person fehlt.');
      return u;
    },
    aufnahmeUrl(id) {
      return blobUrl('aufnahme', id);
    },
    abonniere(fn) {
      abos.add(fn);
      return () => abos.delete(fn);
    },
  };
}
