/**
 * AudioDienst — Implementierung von `AudioDienst` aus src/kern/vertrag.ts.
 *
 * FESTE Ausgaben (nur Dateien, nie live — B12):
 *  - `laut`/`name`: Elternaufnahme → im Laut-Studio gewählte Variante → manifest.laute/namen
 *  - `lautLang`: manifest.laute_lang
 *  - `fest(schluessel)`: manifest.saetze[schluessel] (Varianten, nie zweimal dieselbe hintereinander)
 * FREI Geschriebenes (6c): `wort` → Elternaufnahme → manifest.woerter → Live-Stimme;
 *  `live`/`satz` → Live-Stimme. Live-Stimme nach Einstellung `liveStimme`:
 *  browser (speechSynthesis) | piper (offline, src/audio/piper.ts) | openrouter (eigener Schlüssel).
 *  Piper/OpenRouter-Ergebnisse landen in Cache Storage (live-cache.ts).
 * Tier-Paket-Audio spielen die Modi über `variante()`/`datei()` (Hilfe: src/kern/tierton.ts).
 *
 * Jede neue Ausgabe bricht die laufende ab und liefert dann `abgebrochen` (siehe `Ausgang`).
 * Geworfen wird bei echten Fehlern (`AudioFehler`). Eine Autoplay-Sperre ist nur vor der
 * ersten erfolgreichen Wiedergabe harmlos; danach wird sie als Fehler gemeldet.
 *
 * Entsperren (iOS/Android): erst `touchend`/`pointerup`/`click`/`keydown` zählen als Nutzer-
 * aktivierung — `pointerdown` mit Finger nicht. Deshalb bleiben die Listener aktiv, bis eine
 * Wiedergabe wirklich gestartet ist.
 */
import { istBuchstabe } from '../kern/alphabet';
import {
  AudioFehler,
  type Ausgang,
  type AudioDienst,
  type AudioManifest,
  type AudioSchluessel,
  type Buchstabe,
  type EinstellungenStore,
  type KettenSchritt,
  type LautVariante,
} from '../kern/vertrag';
import { Aufnahmen } from './aufnahmen';
import { browserstimmeVerfuegbar, sprich } from './browserstimme';
import { ausLiveCache, inLiveCache } from './live-cache';
import { OPENROUTER_MODELL, OPENROUTER_STIMME, openrouterSprich, openrouterTranskribiere } from './openrouter';
import { PIPER_STIMME, piperSprich } from './piper';
import { bitteUmDauerhaftenSpeicher } from '../kern/speicher';

/** Präfix für Elternaufnahmen als Varianten-URL (siehe `Einstellungen.gewaehlteLautVarianten`). */
const AUFNAHME = 'aufnahme:';

/** Standardpause zwischen festen Sätzen einer Kette (B11). */
export const KETTEN_PAUSE_MS = 1200;

/** Relativer Pfad (z. B. „audio/laute/m.ki1.mp3“) → URL unter der App-Basis. */
function aufloesen(pfad: string): string {
  if (/^(blob:|data:|https?:)/.test(pfad)) return pfad;
  return import.meta.env.BASE_URL + pfad.replace(/^\.?\//, '');
}

/** Ersetzt `{name}` aus `werte`; ein fehlender Platzhalter ist ein Programmierfehler. */
export function setzePlatzhalter(schluessel: string, werte: Readonly<Record<string, string>> = {}): string {
  return schluessel.replace(/\{([a-z_]+)\}/gi, (_, n: string) => {
    const w = werte[n];
    if (w === undefined) throw new AudioFehler(`Platzhalter „{${n}}“ in „${schluessel}“ ohne Wert.`);
    return w;
  });
}

/** Wählt zufällig einen Index ≠ `zuletzt` (bei nur einer Variante immer 0). */
export function waehleVariante(anzahl: number, zuletzt: number | undefined, zufall: () => number = Math.random): number {
  if (anzahl <= 1) return 0;
  const moeglich = [...Array(anzahl).keys()].filter((i) => i !== zuletzt);
  return moeglich[Math.floor(zufall() * moeglich.length)] ?? 0;
}

/** Winzige stille WAV-Datei zum Entsperren der Wiedergabe (iOS) bei der ersten Geste. */
function stilleWav(): string {
  const proben = 160;
  const puffer = new ArrayBuffer(44 + proben * 2);
  const d = new DataView(puffer);
  const text = (o: number, s: string): void => [...s].forEach((z, i) => d.setUint8(o + i, z.charCodeAt(0)));
  text(0, 'RIFF');
  d.setUint32(4, 36 + proben * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  d.setUint32(16, 16, true);
  d.setUint16(20, 1, true);
  d.setUint16(22, 1, true);
  d.setUint32(24, 8000, true);
  d.setUint32(28, 16000, true);
  d.setUint16(32, 2, true);
  d.setUint16(34, 16, true);
  text(36, 'data');
  d.setUint32(40, proben * 2, true);
  return URL.createObjectURL(new Blob([puffer], { type: 'audio/wav' }));
}

/** Prüft die Form von manifest.json; wirft `AudioFehler` mit dem ersten Problem. */
function pruefeManifest(m: unknown): AudioManifest {
  const o = m as Partial<AudioManifest> | null;
  if (!o || typeof o !== 'object' || !o.laute || !o.namen || !o.woerter) throw new AudioFehler('Audio-Verzeichnis ist unvollständig.');
  const saetze = o.saetze ?? {};
  for (const [k, v] of Object.entries(saetze)) {
    if (!Array.isArray(v) || v.length === 0 || v.some((u) => typeof u !== 'string')) {
      throw new AudioFehler(`Audio-Verzeichnis: Satz „${k}“ braucht eine Liste von Dateien.`);
    }
  }
  return { ...(o as AudioManifest), saetze };
}

/** Was für eine Ausgabe in Frage kommt. */
interface Plan {
  aufnahme?: AudioSchluessel;
  /** Datei-URL (relativ oder Blob-URL), nachdem das Manifest geladen ist; undefined = keine Datei. */
  datei?: () => Promise<string | undefined>;
  /** Text für die Live-Stimme. Ohne: fehlt die Datei, ist das ein Fehler (`fehlt`). */
  live?: string;
  /** Meldung, wenn weder Aufnahme noch Datei da ist und nicht live gesprochen werden darf. */
  fehlt?: string;
}

class Dienst implements AudioDienst {
  private readonly el = new Audio();
  private readonly aufnahmen = new Aufnahmen();
  private manifest: AudioManifest | undefined;
  private laden: Promise<void> | undefined;
  private ctrl = new AbortController();
  /** Zählt jede neue Ausgabe und jedes `stopp()` — Ketten erkennen daran fremde Ausgaben in ihrer Pause. */
  private generation = 0;
  /**
   * Zählt nur ausdrückliche `stopp()`-Aufrufe (Moduswechsel, Weiter-Knopf …), nicht den Abbruch durch
   * eine neue Ausgabe. Eine Kette, in deren Lauf ein `stopp()` kam, ist zu Ende — auch wenn ihr
   * Schritt gerade auf IndexedDB wartete oder ohne eigenen Ton `fertig` lieferte.
   */
  private stopps = 0;
  /** Zuletzt gespielte Variante je Schlüssel (nie zweimal dieselbe hintereinander). */
  private readonly zuletzt = new Map<string, number>();
  /** true, sobald eine Wiedergabe wirklich gestartet ist (play() aufgelöst). */
  private entsperrt = false;
  private gestenAbmelden: () => void = () => undefined;
  /** Live-Erzeugungen, die gerade laufen (Quelle + Text → Ergebnis). */
  private readonly inArbeit = new Map<string, Promise<Blob>>();

  constructor(private readonly einstellungen: EinstellungenStore) {
    this.el.preload = 'auto';
    const geste = (): void => this.entsperre();
    const ereignisse = ['touchend', 'pointerup', 'click', 'keydown'] as const;
    for (const e of ereignisse) document.addEventListener(e, geste, { capture: true, passive: true });
    this.gestenAbmelden = () => {
      for (const e of ereignisse) document.removeEventListener(e, geste, { capture: true });
    };
  }

  /** Eine Wiedergabe lief an: ab jetzt ist eine Sperre ein echter Fehler, die Gesten-Listener gehen weg. */
  private markiereEntsperrt(): void {
    if (this.entsperrt) return;
    this.entsperrt = true;
    this.gestenAbmelden();
  }

  // ---- Laden -------------------------------------------------------------

  vorab(): Promise<void> {
    if (!this.laden) {
      this.laden = (async () => {
        const r = await fetch(aufloesen('audio/manifest.json'));
        if (!r.ok) throw new AudioFehler(`Audio-Verzeichnis nicht ladbar (HTTP ${r.status}).`);
        const m = pruefeManifest(await r.json());
        this.manifest = m;
        this.bereinigeLautWahl(m);
      })().catch((f: unknown) => {
        this.laden = undefined; // nächster Aufruf versucht es erneut
        throw f instanceof AudioFehler ? f : new AudioFehler(`Audio-Verzeichnis nicht ladbar (${String(f)}).`);
      });
    }
    return this.laden;
  }

  private async m(): Promise<AudioManifest> {
    await this.vorab();
    if (!this.manifest) throw new AudioFehler('Audio-Verzeichnis fehlt.');
    return this.manifest;
  }

  // ---- Feste Ausgaben ----------------------------------------------------

  laut(b: Buchstabe): Promise<Ausgang> {
    return this.ausgabe({
      aufnahme: { art: 'laut', text: b },
      datei: async () => {
        const m = await this.m(); // lädt das Manifest und bereinigt dabei veraltete Laut-Studio-Auswahlen
        const gewaehlt = this.einstellungen.lese().gewaehlteLautVarianten[b];
        if (gewaehlt) {
          const url = await this.varianteUrl(gewaehlt);
          if (url) return url;
          // Die gewählte eigene Aufnahme fehlt: Auswahl zurücksetzen und melden, nicht still ersetzen.
          this.vergissWahl(b, gewaehlt);
          throw new AudioFehler(`Die gewählte eigene Aufnahme für „${b}“ fehlt. Es gilt wieder die Standard-Aussprache.`);
        }
        return m.laute[b];
      },
      fehlt: `Für „${b}“ gibt es keinen Laut.`,
    });
  }

  lautLang(b: Buchstabe): Promise<Ausgang> {
    return this.ausgabe({
      datei: async () => (await this.m()).laute_lang?.[b],
      fehlt: `Für „${b}“ fehlt der gedehnte Laut (laute_lang) im Audio-Verzeichnis.`,
    });
  }

  name(b: Buchstabe): Promise<Ausgang> {
    return this.ausgabe({
      aufnahme: { art: 'name', text: b },
      datei: async () => (await this.m()).namen[b],
      fehlt: `Für „${b}“ gibt es keinen Buchstabennamen.`,
    });
  }

  buchstabe(b: Buchstabe): Promise<Ausgang> {
    return this.einstellungen.lese().namenStattLaute ? this.name(b) : this.laut(b);
  }

  async fest(schluessel: string, platzhalter?: Readonly<Record<string, string>>): Promise<Ausgang> {
    const signal = this.neu();
    const s = setzePlatzhalter(schluessel, platzhalter);
    const varianten = (await this.m()).saetze[s];
    if (signal.aborted) return 'abgebrochen';
    if (!varianten?.length) throw new AudioFehler(`Der feste Satz „${s}“ fehlt im Audio-Verzeichnis.`);
    return this.spiele(this.naechsteVariante(`fest:${s}`, varianten), signal);
  }

  async hatFest(schluessel: string): Promise<boolean> {
    return ((await this.m()).saetze[schluessel]?.length ?? 0) > 0;
  }

  async variante(schluessel: string, urls: readonly string[]): Promise<Ausgang> {
    if (!urls.length) throw new AudioFehler(`Keine Audiodatei für „${schluessel}“.`);
    const signal = this.neu();
    return this.spiele(this.naechsteVariante(`variante:${schluessel}`, urls), signal);
  }

  wisch(): Promise<Ausgang> {
    return this.fest('geraeusch.wisch');
  }

  async kette(schritte: readonly KettenSchritt[], pauseMs = KETTEN_PAUSE_MS): Promise<Ausgang> {
    const stoppsVorher = this.stopps;
    for (let i = 0; i < schritte.length; i++) {
      const schritt = schritte[i];
      if (!schritt) continue;
      if (this.stopps !== stoppsVorher) return 'abgebrochen';
      if ((await schritt()) === 'abgebrochen' || this.stopps !== stoppsVorher) return 'abgebrochen';
      if (i < schritte.length - 1 && (await this.pause(pauseMs)) === 'abgebrochen') return 'abgebrochen';
    }
    return 'fertig';
  }

  // ---- Frei Geschriebenes -------------------------------------------------

  wort(w: string): Promise<Ausgang> {
    // So sprechen, wie es im Wörterbuch steht — aber nie ganz in Großbuchstaben (sonst wird buchstabiert).
    const sprech = w.length > 1 && w === w.toLocaleUpperCase('de-DE') ? w.toLocaleLowerCase('de-DE') : w;
    return this.ausgabe({
      aufnahme: { art: 'wort', text: w },
      datei: async () => (await this.m()).woerter[w],
      live: sprech,
    });
  }

  live(text: string): Promise<Ausgang> {
    return this.ausgabe({ live: text });
  }

  satz(text: string): Promise<Ausgang> {
    return this.live(text);
  }

  async datei(url: string): Promise<Ausgang> {
    const signal = this.neu();
    const aufgeloest = await this.varianteUrl(url);
    if (signal.aborted) return 'abgebrochen';
    if (!aufgeloest) throw new AudioFehler('Diese Aufnahme gibt es nicht mehr.');
    return this.spiele(aufgeloest, signal);
  }

  gueltig(): () => boolean {
    const gen = this.generation;
    return () => this.generation === gen;
  }

  stopp(): void {
    this.stopps++;
    this.halt();
  }

  /** Beendet die laufende Ausgabe (gemeinsam für `stopp()` und jede neue Ausgabe). */
  private halt(): void {
    this.generation++;
    this.ctrl.abort();
    this.el.pause();
    if (browserstimmeVerfuegbar()) speechSynthesis.cancel();
  }

  transkribiere(aufnahme: Blob): Promise<string> {
    const schluessel = this.einstellungen.lese().openrouterSchluessel?.trim();
    if (!schluessel) return Promise.reject(new AudioFehler('Für die Spracheingabe über OpenRouter fehlt der eigene Schlüssel.'));
    return openrouterTranskribiere(aufnahme, schluessel);
  }

  // ---- Laut-Studio -------------------------------------------------------

  async lautVarianten(b: Buchstabe): Promise<LautVariante[]> {
    const m = await this.m();
    const liste: LautVariante[] = (m.varianten?.[b] ?? []).map((v) => ({ ...v }));
    if (!liste.length && m.laute[b]) liste.push({ id: 'standard', url: m.laute[b], quelle: 'vorab' });
    if (await this.aufnahmen.hat({ art: 'laut', text: b })) {
      liste.push({ id: 'aufnahme', url: AUFNAHME + b, beschreibung: 'eigene Aufnahme', quelle: 'aufnahme' });
    }
    return liste;
  }

  // ---- Aufnahmen ---------------------------------------------------------

  aufnahmeStarten() {
    this.stopp();
    return this.aufnahmen.starten();
  }

  async aufnahmeSpeichern(s: AudioSchluessel, blob: Blob): Promise<void> {
    await this.aufnahmen.speichern(s, blob);
    // Eigene Aufnahmen gibt es nirgends sonst: den Browser um dauerhaften Speicher bitten.
    bitteUmDauerhaftenSpeicher().catch((f: unknown) => console.error('Dauerhafter Speicher nicht anfragbar', f));
  }

  async aufnahmeLoeschen(s: AudioSchluessel): Promise<void> {
    await this.aufnahmen.loeschen(s);
    // War genau diese Aufnahme im Laut-Studio gewählt, gilt wieder die Standard-Aussprache.
    if (s.art === 'laut' && istBuchstabe(s.text)) this.vergissWahl(s.text, AUFNAHME + s.text);
  }

  hatAufnahme(s: AudioSchluessel): Promise<boolean> {
    return this.aufnahmen.hat(s);
  }

  // ---- intern ------------------------------------------------------------

  /** Bricht die laufende Ausgabe ab und liefert das Signal der neuen. */
  private neu(): AbortSignal {
    this.halt();
    this.ctrl = new AbortController();
    return this.ctrl.signal;
  }

  /** Stille zwischen Kettenschritten; `abgebrochen`, wenn inzwischen eine andere Ausgabe oder `stopp()` kam. */
  private pause(ms: number): Promise<Ausgang> {
    const gen = this.generation;
    return new Promise((ok) => {
      const uhr = window.setInterval(() => {
        if (this.generation !== gen) {
          window.clearInterval(uhr);
          window.clearTimeout(ende);
          ok('abgebrochen');
        }
      }, 50);
      const ende = window.setTimeout(() => {
        window.clearInterval(uhr);
        ok(this.generation === gen ? 'fertig' : 'abgebrochen');
      }, ms);
    });
  }

  private naechsteVariante(schluessel: string, urls: readonly string[]): string {
    const i = waehleVariante(urls.length, this.zuletzt.get(schluessel));
    this.zuletzt.set(schluessel, i);
    return urls[i] as string;
  }

  /**
   * Migration: Eine im Laut-Studio gespeicherte Datei-URL, die das aktuelle Manifest nicht mehr kennt
   * (z. B. die früheren Varianten „…katja.mp3“), wird entfernt — dann gilt die neue Standard-Aussprache.
   * Eigene Aufnahmen (`aufnahme:`) bleiben unberührt.
   */
  private bereinigeLautWahl(m: AudioManifest): void {
    const alle = this.einstellungen.lese().gewaehlteLautVarianten;
    const neu = { ...alle };
    let geaendert = false;
    for (const [b, url] of Object.entries(alle) as [Buchstabe, string | undefined][]) {
      if (!url || url.startsWith(AUFNAHME)) continue;
      const bekannt = url === m.laute[b] || (m.varianten?.[b] ?? []).some((v) => v.url === url);
      if (!bekannt) {
        delete neu[b];
        geaendert = true;
      }
    }
    if (geaendert) this.einstellungen.setze({ gewaehlteLautVarianten: neu });
  }

  /** Entfernt die Laut-Studio-Auswahl für `b`, wenn sie noch `url` ist. */
  private vergissWahl(b: Buchstabe, url: string): void {
    const alle = this.einstellungen.lese().gewaehlteLautVarianten;
    if (alle[b] !== url) return;
    const neu = { ...alle };
    delete neu[b];
    this.einstellungen.setze({ gewaehlteLautVarianten: neu });
  }

  /** Löst Varianten-URLs auf: `aufnahme:<b>` → Blob-URL (oder undefined, wenn gelöscht), sonst die URL selbst. */
  private async varianteUrl(url: string): Promise<string | undefined> {
    if (!url.startsWith(AUFNAHME)) return url;
    const b = url.slice(AUFNAHME.length);
    if (!istBuchstabe(b)) throw new AudioFehler(`Unbekannter Buchstabe in „${url}“.`);
    return this.aufnahmen.url({ art: 'laut', text: b });
  }

  private async ausgabe(p: Plan): Promise<Ausgang> {
    const signal = this.neu();
    if (p.aufnahme) {
      const u = await this.aufnahmen.url(p.aufnahme);
      if (signal.aborted) return 'abgebrochen';
      if (u) return this.spiele(u, signal);
    }
    const d = await p.datei?.();
    if (signal.aborted) return 'abgebrochen';
    if (d) return this.spiele(d, signal);
    if (p.live === undefined) throw new AudioFehler(p.fehlt ?? 'Audiodatei fehlt.');
    return this.liveAusgabe(p.live, signal);
  }

  /** Live-Stimme nach Einstellung (6c). Piper/OpenRouter werden gecacht. */
  private async liveAusgabe(text: string, signal: AbortSignal): Promise<Ausgang> {
    const quelle = this.einstellungen.lese().liveStimme;
    if (quelle === 'browser') return sprich(text, signal, () => this.entsperrt);
    // Ein Abbruch (neue Ausgabe, stopp()) beendet DIESE Ausgabe sofort; die Erzeugung läuft im
    // Hintergrund zu Ende und landet im Cache (siehe liveErzeugen).
    const erzeugt = this.liveErzeugen(quelle, text);
    const abbruch = new Promise<'abgebrochen'>((ok) => {
      if (signal.aborted) ok('abgebrochen');
      else signal.addEventListener('abort', () => ok('abgebrochen'), { once: true });
    });
    let ergebnis: Blob | 'abgebrochen';
    try {
      ergebnis = await Promise.race([erzeugt, abbruch]);
    } catch (f) {
      if (signal.aborted) return 'abgebrochen';
      throw f;
    }
    if (ergebnis === 'abgebrochen' || signal.aborted) {
      // Fehler der weiterlaufenden Erzeugung nicht verschlucken.
      erzeugt.catch((f: unknown) => console.error('Live-Stimme (abgebrochene Ausgabe):', f));
      return 'abgebrochen';
    }
    return this.spieleBlob(ergebnis, signal);
  }

  /**
   * Erzeugt (oder holt aus dem Cache) das Audio für `text`. Läuft unabhängig vom Abbruch der
   * Wiedergabe zu Ende, damit eine bezahlte Anfrage nie verloren geht; gleiche Texte, die gerade
   * erzeugt werden, warten auf dieselbe Anfrage.
   */
  private liveErzeugen(quelle: 'piper' | 'openrouter', text: string): Promise<Blob> {
    let erzeuge: () => Promise<Blob>;
    let cacheQuelle: string;
    if (quelle === 'openrouter') {
      const schluessel = this.einstellungen.lese().openrouterSchluessel?.trim();
      if (!schluessel) return Promise.reject(new AudioFehler('Die Live-Stimme „OpenRouter“ ist gewählt, aber der eigene Schlüssel fehlt.'));
      cacheQuelle = `openrouter/${OPENROUTER_MODELL}/${OPENROUTER_STIMME}`;
      erzeuge = () => openrouterSprich(text, schluessel);
    } else {
      cacheQuelle = `piper/${PIPER_STIMME}`;
      erzeuge = () => piperSprich(text);
    }
    const key = `${cacheQuelle}\n${text}`;
    const laufend = this.inArbeit.get(key);
    if (laufend) return laufend;
    const p = (async () => {
      const alt = await ausLiveCache(cacheQuelle, text);
      if (alt) return alt;
      const neu = await erzeuge();
      await inLiveCache(cacheQuelle, text, neu);
      return neu;
    })().finally(() => this.inArbeit.delete(key));
    this.inArbeit.set(key, p);
    return p;
  }

  private async spieleBlob(blob: Blob, signal: AbortSignal): Promise<Ausgang> {
    const url = URL.createObjectURL(blob);
    try {
      return await this.spiele(url, signal);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** Spielt eine URL auf dem gemeinsamen Audio-Element; löst bei Ende (`fertig`) oder Abbruch (`abgebrochen`) auf. */
  private spiele(pfad: string, signal: AbortSignal): Promise<Ausgang> {
    const el = this.el;
    const url = aufloesen(pfad);
    return new Promise<Ausgang>((ok, fehler) => {
      let erledigt = false;
      const aufraeumen = (): void => {
        erledigt = true;
        el.removeEventListener('ended', ende);
        el.removeEventListener('error', kaputt);
        signal.removeEventListener('abort', abbruch);
      };
      const schluss = (a: Ausgang): void => {
        if (erledigt) return;
        aufraeumen();
        ok(a);
      };
      const ende = (): void => schluss('fertig');
      const abbruch = (): void => schluss('abgebrochen');
      const kaputt = (): void => {
        if (erledigt) return;
        aufraeumen();
        const grund = el.error?.message || `Code ${el.error?.code ?? '?'}`;
        fehler(new AudioFehler(`Audio ließ sich nicht abspielen: ${pfad.startsWith('blob:') ? 'Aufnahme' : pfad} (${grund}).`));
      };
      if (signal.aborted) {
        ok('abgebrochen');
        return;
      }
      el.addEventListener('ended', ende);
      el.addEventListener('error', kaputt);
      signal.addEventListener('abort', abbruch, { once: true });
      el.src = url;
      el.play().then(() => this.markiereEntsperrt(), (f: unknown) => {
        const name = f instanceof DOMException ? f.name : '';
        // Durch eine neue Ausgabe unterbrochen: kein Fehler.
        if (name === 'AbortError' || signal.aborted) abbruch();
        // Autoplay-Sperre vor der ersten erfolgreichen Wiedergabe: erwartbar (noch keine Berührung).
        else if (name === 'NotAllowedError' && !this.entsperrt) abbruch();
        else if (name === 'NotAllowedError') {
          if (erledigt) return;
          aufraeumen();
          fehler(new AudioFehler('Der Browser hat die Tonausgabe blockiert. Bitte einmal auf den Bildschirm tippen.'));
        }
        // NotSupportedError u. a.: das error-Ereignis des Elements meldet die Ursache; ohne Ereignis hier melden.
        else
          queueMicrotask(() => {
            if (erledigt) return;
            aufraeumen();
            fehler(new AudioFehler(`Audio ließ sich nicht abspielen: ${pfad} (${name || String(f)}).`));
          });
      });
    });
  }

  /**
   * iOS/Safari: Wiedergabe erst nach einer Nutzergeste möglich — dort einmal still anspielen.
   * `entsperrt` wird erst gesetzt, wenn play() wirklich aufgelöst hat; scheitert der Versuch
   * (Geste zählte nicht), probiert es die nächste Geste erneut.
   */
  private entsperre(): void {
    if (this.entsperrt) return;
    // Läuft schon eine echte Ausgabe, entsperrt deren play() — nicht dazwischenfunken.
    if (!this.el.paused) return;
    const still = stilleWav();
    this.el.src = still;
    this.el
      .play()
      .then(() => {
        this.markiereEntsperrt();
        if (this.el.src === still) this.el.pause();
      })
      .catch(() => {
        /* Diese Geste reichte nicht (oder eine echte Ausgabe hat übernommen) — die nächste Geste versucht es wieder. */
      })
      .finally(() => URL.revokeObjectURL(still));
    if (browserstimmeVerfuegbar()) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  }
}

export function erzeugeAudioDienst(einstellungen: EinstellungenStore): AudioDienst {
  return new Dienst(einstellungen);
}
