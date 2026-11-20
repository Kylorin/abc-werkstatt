/**
 * Entpacken und Prüfen eines Tier-Pakets nach docs/tier-paket.md (Version 1).
 * Reine Funktionen ohne Speicher: Ergebnis ist entweder ein geprüftes Paket mit genau
 * den referenzierten Dateien oder ein geworfener PaketFehler mit Elternmeldung.
 */
import { unzipSync, strFromU8, type UnzipFileInfo } from 'fflate';
import { istBuchstabe } from '../kern/alphabet';
import { PaketFehler, TIERPAKET_FORMAT, type Tier, type TierPaketDatei } from '../kern/vertrag';
import { kanonischesWort } from './woerter';

export const MAX_TIERE = 200;
export const MAX_DATEI_BYTES = 2 * 1024 * 1024;
export const MAX_ENTPACKT_BYTES = 100 * 1024 * 1024;
const ID_MUSTER = /^[a-z0-9-]+$/;
const MAX_ID = 40;
const MAX_TITEL = 40;
const MAX_TEXT = 300;
const MAX_FEHLER_ANZEIGE = 6;

/** Erlaubte Endungen → MIME-Typ. */
const BILD_TYPEN: Readonly<Record<string, string>> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};
const AUDIO_TYPEN: Readonly<Record<string, string>> = { mp3: 'audio/mpeg' };

export type DateiArt = 'bild' | 'audio';

/** Eine geprüfte, entpackte Datei aus dem Paket. */
export interface PaketInhalt {
  pfad: string;
  art: DateiArt;
  typ: string;
  daten: Uint8Array;
}

export interface GeprueftesPaket {
  datei: TierPaketDatei;
  dateien: PaketInhalt[];
}

function endung(pfad: string): string {
  const punkt = pfad.lastIndexOf('.');
  return punkt < 0 ? '' : pfad.slice(punkt + 1).toLowerCase();
}

/** MIME-Typ eines Pfads im Paket (für Blob-URLs), undefined wenn die Endung nicht erlaubt ist. */
export function mimeTyp(pfad: string, art: DateiArt): string | undefined {
  return (art === 'bild' ? BILD_TYPEN : AUDIO_TYPEN)[endung(pfad)];
}

function istObjekt(w: unknown): w is Record<string, unknown> {
  return typeof w === 'object' && w !== null && !Array.isArray(w);
}

/** Alle Dateien einer Paketdefinition, die gespeichert werden müssen, mit ihrer Art. */
export function referenzierteDateien(p: TierPaketDatei): Map<string, DateiArt> {
  const m = new Map<string, DateiArt>();
  if (p.cover) m.set(p.cover, 'bild');
  for (const t of p.tiere) {
    m.set(t.bild, 'bild');
    if (t.audio?.name) m.set(t.audio.name, 'audio');
    for (const f of t.audio?.freude ?? []) m.set(f, 'audio');
    if (t.audio?.kann) m.set(t.audio.kann, 'audio');
  }
  return m;
}

/**
 * Prüft den Inhalt von paket.json (bereits geparst) und liefert eine bereinigte Fassung
 * ohne unbekannte Felder. Sammelt alle Probleme und wirft sie gemeinsam.
 */
export function pruefePaketJson(roh: unknown): TierPaketDatei {
  const fehler: string[] = [];
  const f = (text: string): void => {
    fehler.push(text);
  };

  if (!istObjekt(roh)) throw new PaketFehler('paket.json enthält kein JSON-Objekt.');

  if (roh['format'] !== TIERPAKET_FORMAT) {
    throw new PaketFehler(
      `Unbekanntes Paketformat „${String(roh['format'] ?? 'fehlt')}“. Erwartet wird „${TIERPAKET_FORMAT}“.`,
    );
  }
  if (roh['sprache'] !== 'de-DE') f(`„sprache“ muss „de-DE“ sein.`);

  const id = roh['id'];
  if (typeof id !== 'string' || !ID_MUSTER.test(id) || id.length > MAX_ID) {
    f(`Die Paket-„id“ muss aus 1–${MAX_ID} Zeichen a–z, 0–9 und - bestehen.`);
  }
  const titel = typeof roh['titel'] === 'string' ? roh['titel'].trim() : undefined;
  if (!titel || titel.length > MAX_TITEL) f(`Der „titel“ fehlt oder ist länger als ${MAX_TITEL} Zeichen.`);

  const untertitel = pruefeOptionalText(roh['untertitel'], '„untertitel“', f);
  const cover = pruefeOptionalPfad(roh['cover'], '„cover“', f);

  const tiereRoh = roh['tiere'];
  const tiere: Tier[] = [];
  if (!Array.isArray(tiereRoh)) {
    f(`„tiere“ fehlt oder ist keine Liste.`);
  } else if (tiereRoh.length === 0) {
    f('Das Paket enthält kein Tier.');
  } else if (tiereRoh.length > MAX_TIERE) {
    f(`Das Paket enthält ${tiereRoh.length} Tiere – erlaubt sind höchstens ${MAX_TIERE}.`);
  } else {
    const ids = new Set<string>();
    const woerter = new Map<string, string>();
    tiereRoh.forEach((t, i) => {
      const tier = pruefeTier(t, i, f);
      if (!tier) return;
      if (ids.has(tier.id)) f(`Die Tier-id „${tier.id}“ kommt mehrfach vor.`);
      ids.add(tier.id);
      const wort = kanonischesWort(tier.name);
      const schon = woerter.get(wort);
      if (schon !== undefined) f(`„${tier.name}“ und „${schon}“ ergeben dasselbe Schreibwort „${wort}“.`);
      else woerter.set(wort, tier.name);
      tiere.push(tier);
    });
  }

  if (fehler.length) wirfSammlung(fehler);

  const datei: TierPaketDatei = {
    format: TIERPAKET_FORMAT,
    id: id as string,
    titel: titel as string,
    sprache: 'de-DE',
    tiere,
  };
  if (untertitel !== undefined) datei.untertitel = untertitel;
  if (cover !== undefined) datei.cover = cover;
  return datei;
}

function wirfSammlung(fehler: string[]): never {
  const sichtbar = fehler.slice(0, MAX_FEHLER_ANZEIGE);
  const rest = fehler.length - sichtbar.length;
  const zeilen = sichtbar.map((z) => `• ${z}`);
  if (rest > 0) zeilen.push(`• … und ${rest} weitere Probleme.`);
  throw new PaketFehler(`Das Paket kann nicht importiert werden:\n${zeilen.join('\n')}`);
}

function pruefeOptionalText(w: unknown, feld: string, f: (t: string) => void): string | undefined {
  if (w === undefined) return undefined;
  if (typeof w !== 'string' || w.trim().length === 0 || w.length > MAX_TEXT) {
    f(`${feld} muss ein Text mit 1–${MAX_TEXT} Zeichen sein.`);
    return undefined;
  }
  return w.trim();
}

/** Pfad im Zip: relativ, mit „/“, ohne „..“, ohne Laufwerk. */
function pruefePfad(w: unknown, feld: string, f: (t: string) => void): string | undefined {
  if (typeof w !== 'string' || w.length === 0) {
    f(`${feld} muss ein Dateipfad sein.`);
    return undefined;
  }
  const teile = w.split('/');
  if (w.startsWith('/') || w.includes('\\') || /^[a-zA-Z]:/.test(w) || teile.some((t) => t === '..' || t === '')) {
    f(`${feld}: „${w}“ ist kein erlaubter Pfad (relativ, ohne „..“, mit „/“ getrennt).`);
    return undefined;
  }
  return w;
}

function pruefeOptionalPfad(w: unknown, feld: string, f: (t: string) => void): string | undefined {
  return w === undefined ? undefined : pruefePfad(w, feld, f);
}

function pruefeTier(roh: unknown, i: number, f: (t: string) => void): Tier | undefined {
  const wo = `Tier ${i + 1}`;
  if (!istObjekt(roh)) {
    f(`${wo} ist kein Objekt.`);
    return undefined;
  }
  const probleme = { n: 0 };
  const g = (t: string): void => {
    probleme.n++;
    f(t);
  };

  const id = roh['id'];
  if (typeof id !== 'string' || !ID_MUSTER.test(id) || id.length > MAX_ID) {
    g(`${wo}: „id“ muss aus 1–${MAX_ID} Zeichen a–z, 0–9 und - bestehen.`);
  }
  const name = typeof roh['name'] === 'string' ? roh['name'].trim() : undefined;
  const benannt = name ? `${wo} („${name}“)` : wo;
  if (!name) {
    g(`${wo}: „name“ fehlt.`);
  } else {
    const wort = kanonischesWort(name);
    const zeichen = Array.from(wort);
    if (zeichen.length < 2 || zeichen.length > 20) {
      g(`${benannt}: Der Name muss 2–20 Buchstaben haben.`);
    }
    const fremd = [...new Set(zeichen.filter((z) => !istBuchstabe(z)))];
    if (fremd.length) {
      g(`${benannt}: Der Name darf nur a–z, ä, ö, ü, ß enthalten – nicht: ${fremd.map((z) => (z === ' ' ? 'Leerzeichen' : z)).join(' ')}`);
    }
  }
  const artikel = roh['artikel'];
  if (artikel !== 'der' && artikel !== 'die' && artikel !== 'das') {
    g(`${benannt}: „artikel“ muss der, die oder das sein.`);
  }
  const bild = pruefePfad(roh['bild'], `${benannt}: „bild“`, g);
  const kann = pruefeOptionalText(roh['kann'], `${benannt}: „kann“`, g);
  const freude = pruefeOptionalText(roh['freude'], `${benannt}: „freude“`, g);

  let audio: Tier['audio'];
  const audioRoh = roh['audio'];
  if (audioRoh !== undefined) {
    if (!istObjekt(audioRoh)) {
      g(`${benannt}: „audio“ muss ein Objekt sein.`);
    } else {
      audio = {};
      const audioName = pruefeOptionalPfad(audioRoh['name'], `${benannt}: „audio.name“`, g);
      if (audioName !== undefined) audio.name = audioName;
      const audioKann = pruefeOptionalPfad(audioRoh['kann'], `${benannt}: „audio.kann“`, g);
      if (audioKann !== undefined) audio.kann = audioKann;
      const freudeRoh = audioRoh['freude'];
      if (freudeRoh !== undefined) {
        if (!Array.isArray(freudeRoh)) {
          g(`${benannt}: „audio.freude“ muss eine Liste von Dateipfaden sein.`);
        } else {
          const liste = freudeRoh
            .map((p, j) => pruefePfad(p, `${benannt}: „audio.freude[${j + 1}]“`, g))
            .filter((p): p is string => p !== undefined);
          if (liste.length) audio.freude = liste;
        }
      }
    }
  }

  if (probleme.n > 0) return undefined;
  const tier: Tier = {
    id: id as string,
    name: name as string,
    artikel: artikel as Tier['artikel'],
    bild: bild as string,
  };
  if (kann !== undefined) tier.kann = kann;
  if (freude !== undefined) tier.freude = freude;
  if (audio && (audio.name || audio.freude || audio.kann)) tier.audio = audio;
  return tier;
}

function istVerzeichnis(name: string): boolean {
  return name.endsWith('/');
}

/** Entpackt mit fflate und übersetzt dessen Fehler in eine Elternmeldung (Ursache bleibt in `cause`). */
function entpacke(daten: Uint8Array, filter: (info: UnzipFileInfo) => boolean): Record<string, Uint8Array> {
  try {
    return unzipSync(daten, { filter });
  } catch (e) {
    if (e instanceof PaketFehler) throw e;
    throw new PaketFehler('Die Datei ist kein gültiges Zip-Archiv (oder beschädigt).', { cause: e });
  }
}

/**
 * Entpackt und prüft ein Paket-Zip vollständig. Entpackt wird zweistufig: erst nur
 * paket.json (dabei wird die angegebene Gesamtgröße aller Einträge summiert), dann nur
 * die referenzierten Dateien mit Größenprüfung VOR dem Entpacken.
 */
export function pruefeZip(daten: Uint8Array): GeprueftesPaket {
  let gesamt = 0;
  const namen = new Set<string>();
  const ersteStufe = entpacke(daten, (info) => {
    if (istVerzeichnis(info.name)) return false;
    namen.add(info.name);
    gesamt += info.originalSize;
    return info.name === 'paket.json';
  });

  if (gesamt > MAX_ENTPACKT_BYTES) {
    throw new PaketFehler(
      `Das Paket ist entpackt ${mb(gesamt)} groß – erlaubt sind höchstens ${mb(MAX_ENTPACKT_BYTES)}.`,
    );
  }

  const jsonBytes = ersteStufe['paket.json'];
  if (!jsonBytes) {
    const verschachtelt = [...namen].find((n) => n.endsWith('/paket.json'));
    throw new PaketFehler(
      verschachtelt
        ? `paket.json liegt im Ordner „${verschachtelt.slice(0, -'/paket.json'.length)}“. Bitte den INHALT des Ordners zippen, sodass paket.json ganz oben liegt.`
        : 'Im Zip fehlt die Datei paket.json an oberster Stelle.',
    );
  }

  let roh: unknown;
  try {
    roh = JSON.parse(strFromU8(jsonBytes));
  } catch (e) {
    throw new PaketFehler('paket.json ist kein gültiges JSON.', { cause: e });
  }
  const datei = pruefePaketJson(roh);

  // Referenzierte Dateien: Existenz, Endung und angegebene Größe prüfen.
  const benoetigt = referenzierteDateien(datei);
  const fehler: string[] = [];
  for (const [pfad, art] of benoetigt) {
    if (!namen.has(pfad)) {
      fehler.push(`Die Datei „${pfad}“ fehlt im Zip.`);
    } else if (!mimeTyp(pfad, art)) {
      fehler.push(
        art === 'bild'
          ? `„${pfad}“ ist kein erlaubtes Bild (webp, png, jpg, svg).`
          : `„${pfad}“ ist keine mp3-Datei.`,
      );
    }
  }
  if (fehler.length) wirfSammlung(fehler);

  const zweiteStufe = entpacke(daten, (info) => {
    if (!benoetigt.has(info.name)) return false;
    if (info.originalSize > MAX_DATEI_BYTES) {
      throw new PaketFehler(`„${info.name}“ ist ${mb(info.originalSize)} groß – erlaubt sind höchstens 2 MB je Datei.`);
    }
    return true;
  });

  const dateien: PaketInhalt[] = [];
  let tatsaechlich = jsonBytes.length;
  for (const [pfad, art] of benoetigt) {
    const inhalt = zweiteStufe[pfad];
    if (!inhalt) throw new PaketFehler(`Die Datei „${pfad}“ konnte nicht entpackt werden.`);
    // Die Größe im Zip-Verzeichnis kann falsch sein – die echte Größe zählt.
    if (inhalt.length > MAX_DATEI_BYTES) {
      throw new PaketFehler(`„${pfad}“ ist ${mb(inhalt.length)} groß – erlaubt sind höchstens 2 MB je Datei.`);
    }
    tatsaechlich += inhalt.length;
    dateien.push({ pfad, art, typ: mimeTyp(pfad, art) as string, daten: inhalt });
  }
  if (tatsaechlich > MAX_ENTPACKT_BYTES) {
    throw new PaketFehler(`Das Paket ist entpackt zu groß – erlaubt sind höchstens ${mb(MAX_ENTPACKT_BYTES)}.`);
  }

  return { datei, dateien };
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}
