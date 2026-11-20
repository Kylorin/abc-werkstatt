/**
 * AudioDienst (Bau „audio“) — Implementierung von `AudioDienst` aus src/kern/vertrag.ts.
 *
 * Quellen je Ausgabe, in dieser Reihenfolge:
 *  (a) Elternaufnahme (IndexedDB)
 *  (b) im Laut-Studio gewählte Variante (nur Laute)
 *  (c) vorab vertonte Datei laut public/audio/manifest.json
 *  (d) bereits live vertontes Audio aus dem Cache
 *  (e) Azure live — nur mit eigenem Schlüssel + Region aus den Einstellungen
 *  (f) Browserstimme (speechSynthesis, de-DE)
 * Tier-Paket-Audio spielen die Modi über `datei(await ctx.pakete.audioUrl(...))`.
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
  type LautVariante,
} from '../kern/vertrag';
import { Aufnahmen } from './aufnahmen';
import { ausCache, vertone, type AzureZugang } from './azure';
import { browserstimmeVerfuegbar, sprich } from './browserstimme';
import { lautSsml, nameSsml, textSsml } from './ipa';
import { bitteUmDauerhaftenSpeicher } from '../kern/speicher';

/** Präfixe für besondere Varianten-URLs (siehe `Einstellungen.gewaehlteLautVarianten`). */
const AUFNAHME = 'aufnahme:';
const AZURE = 'azure:';

/** Relativer Pfad (z. B. „audio/laute/m.ki1.mp3“) → URL unter der App-Basis. */
function aufloesen(pfad: string): string {
  if (/^(blob:|data:|https?:)/.test(pfad)) return pfad;
  return import.meta.env.BASE_URL + pfad.replace(/^\.?\//, '');
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

/** Was für eine Ausgabe in Frage kommt. */
interface Plan {
  aufnahme?: AudioSchluessel;
  /** Datei-URL (relativ oder Blob-URL) bzw. fertiges Audio, nachdem das Manifest geladen ist; undefined = keine Datei. */
  datei?: () => Promise<string | Blob | undefined>;
  /** SSML-Inhalt für Cache und Azure. */
  ssml: string;
  /** Text für die Browserstimme. */
  text: string;
}

class Dienst implements AudioDienst {
  private readonly el = new Audio();
  private readonly aufnahmen = new Aufnahmen();
  private manifest: AudioManifest | undefined;
  private laden: Promise<void> | undefined;
  private ctrl = new AbortController();
  /** true, sobald eine Wiedergabe wirklich gestartet ist (play() aufgelöst). */
  private entsperrt = false;
  private gestenAbmelden: () => void = () => undefined;

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
        const url = aufloesen('audio/manifest.json');
        const r = await fetch(url);
        if (!r.ok) throw new AudioFehler(`Audio-Verzeichnis nicht ladbar (HTTP ${r.status}).`);
        const m = (await r.json()) as AudioManifest;
        if (!m.laute || !m.namen || !m.woerter) throw new AudioFehler('Audio-Verzeichnis ist unvollständig.');
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

  // ---- Ausgaben ----------------------------------------------------------

  laut(b: Buchstabe): Promise<Ausgang> {
    return this.ausgabe({
      aufnahme: { art: 'laut', text: b },
      datei: async () => {
        const m = await this.m(); // lädt das Manifest und bereinigt dabei veraltete Laut-Studio-Auswahlen
        const gewaehlt = this.einstellungen.lese().gewaehlteLautVarianten[b];
        if (gewaehlt?.startsWith(AZURE)) {
          const z = this.azure();
          if (!z) {
            throw new AudioFehler(
              `Im Laut-Studio ist für „${b}“ die Live-Stimme gewählt, aber der eigene Azure-Schlüssel fehlt. ` +
                'Bitte den Schlüssel eintragen oder im Laut-Studio „Standard“ wählen.',
            );
          }
          const ssml = lautSsml(b);
          return (await ausCache(z.stimme, ssml)) ?? (await vertone(z, ssml));
        }
        if (gewaehlt) {
          const url = await this.varianteUrl(gewaehlt);
          if (url) return url;
          // Die gewählte eigene Aufnahme fehlt: Auswahl zurücksetzen und melden, nicht still ersetzen.
          this.vergissWahl(b, gewaehlt);
          throw new AudioFehler(`Die gewählte eigene Aufnahme für „${b}“ fehlt. Es gilt wieder die Standard-Aussprache.`);
        }
        return m.laute[b];
      },
      ssml: lautSsml(b),
      text: b,
    });
  }

  name(b: Buchstabe): Promise<Ausgang> {
    return this.ausgabe({
      aufnahme: { art: 'name', text: b },
      datei: async () => (await this.m()).namen[b],
      ssml: nameSsml(b),
      text: b,
    });
  }

  buchstabe(b: Buchstabe): Promise<Ausgang> {
    return this.einstellungen.lese().namenStattLaute ? this.name(b) : this.laut(b);
  }

  wort(w: string): Promise<Ausgang> {
    // So sprechen, wie es im Wörterbuch steht — aber nie ganz in Großbuchstaben (sonst wird buchstabiert).
    const sprech = w.length > 1 && w === w.toLocaleUpperCase('de-DE') ? w.toLocaleLowerCase('de-DE') : w;
    return this.ausgabe({
      aufnahme: { art: 'wort', text: w },
      datei: async () => (await this.m()).woerter[w],
      ssml: textSsml(sprech, false),
      text: sprech,
    });
  }

  satz(text: string): Promise<Ausgang> {
    return this.ausgabe({
      datei: async () => (await this.m()).saetze?.[text],
      ssml: textSsml(text, true),
      text,
    });
  }

  async datei(url: string): Promise<Ausgang> {
    const signal = this.neu();
    if (url.startsWith(AZURE)) {
      const b = this.buchstabeAus(url, AZURE);
      const z = this.azure();
      if (!z) throw new AudioFehler('Für die Live-Vertonung fehlt der eigene Azure-Schlüssel.');
      const blob = (await ausCache(z.stimme, lautSsml(b))) ?? (await vertone(z, lautSsml(b)));
      if (signal.aborted) return 'abgebrochen';
      return this.spieleBlob(blob, signal);
    }
    const aufgeloest = await this.varianteUrl(url);
    if (signal.aborted) return 'abgebrochen';
    if (!aufgeloest) throw new AudioFehler('Diese Aufnahme gibt es nicht mehr.');
    return this.spiele(aufgeloest, signal);
  }

  stopp(): void {
    this.ctrl.abort();
    this.el.pause();
    if (browserstimmeVerfuegbar()) speechSynthesis.cancel();
  }

  // ---- Laut-Studio -------------------------------------------------------

  async lautVarianten(b: Buchstabe): Promise<LautVariante[]> {
    const m = await this.m();
    const liste: LautVariante[] = (m.varianten?.[b] ?? []).map((v) => ({ ...v }));
    if (!liste.length && m.laute[b]) liste.push({ id: 'standard', url: m.laute[b], quelle: 'vorab' });
    if (await this.aufnahmen.hat({ art: 'laut', text: b })) {
      liste.push({ id: 'aufnahme', url: AUFNAHME + b, beschreibung: 'eigene Aufnahme', quelle: 'aufnahme' });
    }
    const z = this.azure();
    if (z) liste.push({ id: 'azure', url: AZURE + b, beschreibung: `live: ${z.stimme}`, quelle: 'azure' });
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
    this.stopp();
    this.ctrl = new AbortController();
    return this.ctrl.signal;
  }

  private azure(): AzureZugang | undefined {
    const e = this.einstellungen.lese();
    const schluessel = e.azureSchluessel?.trim();
    const region = e.azureRegion?.trim();
    return schluessel && region ? { schluessel, region, stimme: e.stimme } : undefined;
  }

  /**
   * Migration: Eine im Laut-Studio gespeicherte Datei-URL, die das aktuelle Manifest nicht mehr kennt
   * (z. B. die früheren Varianten „…katja.mp3“), wird entfernt — dann gilt die neue Standard-Aussprache.
   * Eigene Aufnahmen (`aufnahme:`) und die Live-Stimme (`azure:`) bleiben unberührt.
   */
  private bereinigeLautWahl(m: AudioManifest): void {
    const alle = this.einstellungen.lese().gewaehlteLautVarianten;
    const neu = { ...alle };
    let geaendert = false;
    for (const [b, url] of Object.entries(alle) as [Buchstabe, string | undefined][]) {
      if (!url || url.startsWith(AUFNAHME) || url.startsWith(AZURE)) continue;
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

  private buchstabeAus(url: string, praefix: string): Buchstabe {
    const b = url.slice(praefix.length);
    if (!istBuchstabe(b)) throw new AudioFehler(`Unbekannter Buchstabe in „${url}“.`);
    return b;
  }

  /** Löst Varianten-URLs auf: `aufnahme:<b>` → Blob-URL (oder undefined, wenn gelöscht), sonst die URL selbst. */
  private async varianteUrl(url: string): Promise<string | undefined> {
    if (url.startsWith(AUFNAHME)) return this.aufnahmen.url({ art: 'laut', text: this.buchstabeAus(url, AUFNAHME) });
    if (url.startsWith(AZURE)) return undefined;
    return url;
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
    if (d instanceof Blob) return this.spieleBlob(d, signal);
    if (d) return this.spiele(d, signal);

    const stimme = this.einstellungen.lese().stimme;
    const gecacht = await ausCache(stimme, p.ssml);
    if (signal.aborted) return 'abgebrochen';
    if (gecacht) return this.spieleBlob(gecacht, signal);

    const z = this.azure();
    if (z) {
      const blob = await vertone(z, p.ssml);
      if (signal.aborted) return 'abgebrochen';
      return this.spieleBlob(blob, signal);
    }
    return sprich(p.text, signal, () => this.entsperrt);
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
