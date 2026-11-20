/**
 * Entpacken und Prüfen eines Tier-Pakets nach docs/tier-paket.md (Version 1).
 * Reine Funktionen ohne Speicher: Ergebnis ist entweder ein geprüftes Paket mit genau
 * den referenzierten Dateien oder ein geworfener PaketFehler mit Elternmeldung.
 */
import { unzipSync, strFromU8, type UnzipFileInfo } from 'fflate';
import { istBuchstabe } from '../kern/alphabet';
import {
  BEWEGUNGEN,
  PaketFehler,
  TIERPAKET_FORMAT,
  type Bewegung,
  type Situation,
  type Tier,
  type TierAudio,
  type TierAudioListe,
  type TierPaketDatei,
} from '../kern/vertrag';
import { kanonischesWort } from './woerter';

export const MAX_TIERE = 200;
export const MAX_DATEI_BYTES = 2 * 1024 * 1024;
export const MAX_ENTPACKT_BYTES = 100 * 1024 * 1024;
const ID_MUSTER = /^[a-z0-9-]+$/;
const MAX_ID = 40;
const MAX_TITEL = 40;
const MAX_TEXT = 300;
const MAX_FEHLER_ANZEIGE = 6;
const ANLAUT_MUSTER = /^[a-zäöüß-]{1,12}$/;
const MAX_SILBEN = 8;
const MAX_RAETSEL = 3;
const MAX_SITUATIONEN = 20;
/** Höchstzahl Dateien in einer Audio-Liste (Varianten bzw. je Silbe/Rätselsatz eine). */
const MAX_LISTE = 8;
/** Listen-Felder in `audio` (Varianten bzw. je Silbe/Rätsel eine Datei). */
const AUDIO_LISTEN: readonly TierAudioListe[] = [
  'freude', 'anlautName', 'lautRuf', 'ichFange', 'raetsel', 'ichBin', 'silben', 'geschrieben', 'nichtIch', 'gaehnen', 'geraeusch',
];

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
    if (t.audio?.kann) m.set(t.audio.kann, 'audio');
    for (const feld of AUDIO_LISTEN) for (const f of t.audio?.[feld] ?? []) m.set(f, 'audio');
    for (const sit of t.situationen ?? []) {
      for (const f of sit.audio?.problem ?? []) m.set(f, 'audio');
      for (const f of sit.audio?.loesung ?? []) m.set(f, 'audio');
    }
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

  pruefeQuerbezuege(tiere, f);
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

/** Helfer existieren im Paket, Situations-ids sind eindeutig, ein Tier hilft sich nicht selbst. */
function pruefeQuerbezuege(tiere: readonly Tier[], f: (t: string) => void): void {
  const ids = new Set(tiere.map((t) => t.id));
  const situationen = new Set<string>();
  for (const t of tiere) {
    for (const s of t.situationen ?? []) {
      if (situationen.has(s.id)) f(`Die Situations-id „${s.id}“ kommt mehrfach vor.`);
      situationen.add(s.id);
      if (!ids.has(s.helfer)) f(`Situation „${s.id}“: Das Helfer-Tier „${s.helfer}“ gibt es im Paket nicht.`);
      else if (s.helfer === t.id) f(`Situation „${s.id}“: Ein Tier kann nicht sein eigener Helfer sein.`);
    }
  }
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

  const anlautRoh = roh['anlaut'];
  let anlaut: string | undefined;
  if (anlautRoh !== undefined) {
    if (typeof anlautRoh !== 'string' || !ANLAUT_MUSTER.test(anlautRoh)) {
      g(`${benannt}: „anlaut“ muss ein Laut aus 1–12 Kleinbuchstaben sein (z. B. „m“ oder „sch“).`);
    } else anlaut = anlautRoh;
  }
  const silben = pruefeTextListe(roh['silben'], `${benannt}: „silben“`, MAX_SILBEN, g);
  const raetsel = pruefeTextListe(roh['raetsel'], `${benannt}: „raetsel“`, MAX_RAETSEL, g);
  const bewegungRoh = roh['bewegung'];
  let bewegung: Bewegung | undefined;
  if (bewegungRoh !== undefined) {
    if (!(BEWEGUNGEN as readonly unknown[]).includes(bewegungRoh)) g(`${benannt}: „bewegung“ muss eine von ${BEWEGUNGEN.join(', ')} sein.`);
    else bewegung = bewegungRoh as Bewegung;
  }
  const situationen = pruefeSituationen(roh['situationen'], benannt, g);

  let audio: TierAudio | undefined;
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
      for (const feld of AUDIO_LISTEN) {
        const liste = pruefePfadListe(audioRoh[feld], `${benannt}: „audio.${feld}“`, g);
        if (liste) audio[feld] = liste;
      }
      if (audio.silben && audio.silben.length !== (silben?.length ?? 0)) {
        g(`${benannt}: „audio.silben“ braucht genau eine Datei je Silbe in „silben“.`);
      }
      if (audio.raetsel && audio.raetsel.length !== (raetsel?.length ?? 0)) {
        g(`${benannt}: „audio.raetsel“ braucht genau eine Datei je Satz in „raetsel“.`);
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
  if (anlaut !== undefined) tier.anlaut = anlaut;
  if (silben) tier.silben = silben;
  if (bewegung) tier.bewegung = bewegung;
  if (raetsel) tier.raetsel = raetsel;
  if (situationen?.length) tier.situationen = situationen;
  if (audio && Object.keys(audio).length) tier.audio = audio;
  return tier;
}

/** Liste von Texten (je 1–MAX_TEXT Zeichen), 1–max Einträge; undefined, wenn das Feld fehlt oder ungültig ist. */
function pruefeTextListe(w: unknown, feld: string, max: number, f: (t: string) => void): string[] | undefined {
  if (w === undefined) return undefined;
  if (!Array.isArray(w) || w.length < 1 || w.length > max) {
    f(`${feld} muss eine Liste mit 1–${max} Texten sein.`);
    return undefined;
  }
  const aus: string[] = [];
  w.forEach((t, i) => {
    if (typeof t !== 'string' || t.trim().length === 0 || t.length > MAX_TEXT) f(`${feld}[${i + 1}] muss ein Text mit 1–${MAX_TEXT} Zeichen sein.`);
    else aus.push(t.trim());
  });
  return aus.length === w.length ? aus : undefined;
}

/** Liste von 1–MAX_LISTE Dateipfaden; undefined, wenn das Feld fehlt oder ungültig ist. */
function pruefePfadListe(w: unknown, feld: string, f: (t: string) => void): string[] | undefined {
  if (w === undefined) return undefined;
  if (!Array.isArray(w) || w.length === 0 || w.length > MAX_LISTE) {
    f(`${feld} muss eine Liste von 1–${MAX_LISTE} Dateipfaden sein.`);
    return undefined;
  }
  const liste = w.map((p, j) => pruefePfad(p, `${feld}[${j + 1}]`, f)).filter((p): p is string => p !== undefined);
  return liste.length === w.length ? liste : undefined;
}

/** Situationen eines Problemtiers (F6). Der Helfer wird in `pruefeQuerbezuege` gegen das Paket geprüft. */
function pruefeSituationen(w: unknown, benannt: string, f: (t: string) => void): Situation[] | undefined {
  if (w === undefined) return undefined;
  if (!Array.isArray(w) || w.length > MAX_SITUATIONEN) {
    f(`${benannt}: „situationen“ muss eine Liste mit höchstens ${MAX_SITUATIONEN} Einträgen sein.`);
    return undefined;
  }
  const aus: Situation[] = [];
  w.forEach((roh, i) => {
    const wo = `${benannt}: Situation ${i + 1}`;
    if (!istObjekt(roh)) {
      f(`${wo} ist kein Objekt.`);
      return;
    }
    let ok = true;
    const id = roh['id'];
    if (typeof id !== 'string' || !ID_MUSTER.test(id) || id.length > MAX_ID) {
      f(`${wo}: „id“ muss aus 1–${MAX_ID} Zeichen a–z, 0–9 und - bestehen.`);
      ok = false;
    }
    const helfer = roh['helfer'];
    if (typeof helfer !== 'string' || !ID_MUSTER.test(helfer)) {
      f(`${wo}: „helfer“ muss die id eines Tiers im Paket sein.`);
      ok = false;
    }
    const texte: Record<'problem' | 'loesung', string | undefined> = { problem: undefined, loesung: undefined };
    for (const k of ['problem', 'loesung'] as const) {
      const t = roh[k];
      if (typeof t !== 'string' || t.trim().length === 0 || t.length > MAX_TEXT) {
        f(`${wo}: „${k}“ muss ein Text mit 1–${MAX_TEXT} Zeichen sein.`);
        ok = false;
      } else texte[k] = t.trim();
    }
    let audio: Situation['audio'];
    const audioRoh = roh['audio'];
    if (audioRoh !== undefined) {
      if (!istObjekt(audioRoh)) {
        f(`${wo}: „audio“ muss ein Objekt sein.`);
        ok = false;
      } else {
        audio = {};
        const pr = pruefePfadListe(audioRoh['problem'], `${wo}: „audio.problem“`, f);
        const lo = pruefePfadListe(audioRoh['loesung'], `${wo}: „audio.loesung“`, f);
        if (pr) audio.problem = pr;
        if (lo) audio.loesung = lo;
      }
    }
    if (!ok) return;
    const s: Situation = { id: id as string, problem: texte.problem as string, helfer: helfer as string, loesung: texte.loesung as string };
    if (audio && (audio.problem || audio.loesung)) s.audio = audio;
    aus.push(s);
  });
  return aus;
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
