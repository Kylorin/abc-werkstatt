/**
 * Hash-Router (Fundament). Routen: `#/` Start, `#/<modus>`, `#/<modus>/<param>`.
 *
 * Beim Laden der Seite geht es IMMER auf den Start (Hash wird verworfen):
 * Ein Kind landet nach Neuladen nie mitten in den Einstellungen — und die Abnahme
 * verlässt sich darauf (Neuladen → Startseite).
 *
 * Der Router baut für jeden Modus den Rahmen: Kopfzeile mit `zurueck` (data-testid)
 * und Titel, darunter die Fläche, in die `modus.mount()` schreibt.
 *
 * Kind-Modi (alles ohne `fuerEltern`, B7):
 * - `zurueck` ist klein und braucht 1 s Halten (`data-halten-ms="1000"`); ein kurzer Tipp sagt
 *   leise `zurueck.halten` (für Eltern). Tastatur (Enter) geht direkt.
 * - Ein zusätzlicher History-Eintrag fängt das Android-/Browser-Zurück ab (`data-falle="ja"` am Rahmen).
 * - Ein Wake Lock hält den Bildschirm an (`data-wachhalten="an|aus|nicht-verfuegbar"` am Rahmen).
 */
import { el, fehlerHinweis, leeren } from './dom';
import { mitHalten } from './halten';
import { icon } from './ui/icons';
import { zeigeStart } from './start';
import type { Dienste, Kontext, Modus, ModusId } from './vertrag';

export type { Dienste } from './vertrag';

/** Wird nach jedem Bildschirmwechsel auf `window` ausgelöst (z. B. für aufgeschobene Updates). */
export const ROUTE_GEWECHSELT = 'abc-werkstatt:route';

/** So lange muss `zurueck` in Kind-Modi gehalten werden (B7). */
export const ZURUECK_HALTEN_MS = 1000;

export interface Router {
  navigiere(ziel: ModusId | 'start', param?: string): void;
  /** Aktuelle Route. */
  aktuell(): { ziel: ModusId | 'start'; param?: string };
}

function leseHash(): { ziel: ModusId | 'start'; param?: string } {
  const teile = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [ziel, param] = teile;
  if (!ziel) return { ziel: 'start' };
  return param === undefined ? { ziel: ziel as ModusId } : { ziel: ziel as ModusId, param };
}

function hashFuer(ziel: ModusId | 'start', param?: string): string {
  if (ziel === 'start') return '#/';
  return `#/${encodeURIComponent(ziel)}${param !== undefined ? '/' + encodeURIComponent(param) : ''}`;
}

/** Ist das ein Eintrag der History-Falle? */
function istFalle(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as { falle?: unknown }).falle === true;
}

type WakeLockSentinelLike = { release(): Promise<void>; addEventListener(t: 'release', f: () => void): void };
type WakeLockLike = { request(art: 'screen'): Promise<WakeLockSentinelLike> };

/** Hält den Bildschirm an, solange ein Kind-Modus offen ist. Ablehnung ist kein Fehler fürs Kind (nur Log). */
class Wachhalter {
  private sperre: WakeLockSentinelLike | undefined;
  private gewuenscht = false;
  private rahmen: HTMLElement | undefined;

  constructor() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.gewuenscht && !this.sperre) void this.hole();
    });
  }

  an(rahmen: HTMLElement): void {
    this.gewuenscht = true;
    this.rahmen = rahmen;
    void this.hole();
  }

  aus(): void {
    this.gewuenscht = false;
    this.rahmen = undefined;
    const s = this.sperre;
    this.sperre = undefined;
    s?.release().catch((f: unknown) => console.warn('Wake Lock ließ sich nicht freigeben', f));
  }

  private async hole(): Promise<void> {
    const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    const rahmen = this.rahmen;
    if (!wl) {
      if (rahmen) rahmen.dataset.wachhalten = 'nicht-verfuegbar';
      return;
    }
    try {
      const s = await wl.request('screen');
      if (!this.gewuenscht || this.rahmen !== rahmen) {
        await s.release();
        return;
      }
      this.sperre = s;
      if (rahmen) rahmen.dataset.wachhalten = 'an';
      s.addEventListener('release', () => {
        if (this.sperre === s) this.sperre = undefined;
        if (this.rahmen === rahmen && rahmen) rahmen.dataset.wachhalten = 'aus';
      });
    } catch (f) {
      // z. B. Energiesparmodus oder Tab im Hintergrund — beim nächsten Sichtbarwerden neu versuchen.
      console.warn('Wake Lock nicht erhalten', f);
      if (rahmen && this.rahmen === rahmen) rahmen.dataset.wachhalten = 'aus';
    }
  }
}

export function starteRouter(wurzel: HTMLElement, dienste: Dienste, modi: readonly Modus[]): Router {
  const register = new Map<ModusId, Modus>(modi.map((m) => [m.id, m]));
  const wach = new Wachhalter();
  let aktiv: Modus | undefined;
  let rahmenAktiv: HTMLElement | undefined;
  let lauf = 0; // verhindert, dass ein langsamer async-mount nach dem Weiternavigieren noch zeichnet

  const router: Router = {
    navigiere(ziel, param) {
      const neu = hashFuer(ziel, param);
      // Aus einer History-Falle heraus ersetzt der neue Eintrag die Falle (sonst führte Zurück wieder hinein).
      if (istFalle(history.state)) history.replaceState(null, '', neu);
      else if (location.hash === neu) return zeige();
      else history.pushState(null, '', neu);
      zeige();
    },
    aktuell: leseHash,
  };

  function verlasseAktiv(): void {
    dienste.audio.stopp();
    wach.aus();
    rahmenAktiv = undefined;
    if (aktiv) {
      const alt = aktiv;
      aktiv = undefined;
      alt.unmount();
    }
  }

  function zeige(): void {
    zeichne();
    window.dispatchEvent(new Event(ROUTE_GEWECHSELT));
  }

  function zurueckKnopf(modus: Modus): HTMLButtonElement {
    const ziel = (): void => router.navigiere(modus.zurueckZu ?? 'start');
    const knopf = el(
      'button',
      {
        klasse: 'knopf knopf--icon knopf--leise',
        testid: 'zurueck',
        attr: { 'aria-label': modus.fuerEltern ? 'Zurück' : 'Zurück (gedrückt halten)' },
        beiKlick: modus.fuerEltern ? ziel : undefined,
      },
      icon('zurueck', { groesse: 28 }),
    );
    if (!modus.fuerEltern) {
      knopf.classList.add('kopf__zurueck--kind');
      knopf.dataset.haltenMs = String(ZURUECK_HALTEN_MS);
      mitHalten(knopf, {
        ms: ZURUECK_HALTEN_MS,
        beiHalten: ziel,
        beiKurz: () => {
          dienste.audio.fest('zurueck.halten').catch((f: unknown) => console.error(f));
        },
      });
    }
    return knopf;
  }

  function zeichne(): void {
    const nr = ++lauf;
    verlasseAktiv();
    leeren(wurzel);
    const { ziel, param } = leseHash();
    if (ziel === 'start') {
      zeigeStart(wurzel, dienste, modi, router.navigiere);
      document.title = 'ABC-Werkstatt';
      return;
    }
    const modus = register.get(ziel);
    if (!modus) {
      history.replaceState(null, '', hashFuer('start'));
      zeigeStart(wurzel, dienste, modi, router.navigiere);
      return;
    }

    const kind = !modus.fuerEltern;
    const titel = el('h1', { klasse: 'kopf__titel', text: modus.titel });
    const flaeche = el('main', { klasse: 'flaeche', attr: { 'data-modus': modus.id } });
    const rahmen = el(
      'div',
      { klasse: 'rahmen', attr: { 'data-modus': modus.id, 'data-kind': kind ? 'ja' : 'nein' } },
      el('header', { klasse: 'kopf' }, zurueckKnopf(modus), titel, el('div', { klasse: 'kopf__platz' })),
      flaeche,
    );
    wurzel.append(rahmen);
    rahmenAktiv = rahmen;
    document.title = `${modus.titel} · ABC-Werkstatt`;

    if (kind) {
      if (!istFalle(history.state)) history.pushState({ falle: true }, '', location.hash);
      rahmen.dataset.falle = 'ja';
      wach.an(rahmen);
    }

    const ctx: Kontext = {
      ...dienste,
      modi,
      navigiere: router.navigiere,
      param,
      setzeTitel: (t) => {
        if (nr === lauf) titel.textContent = t;
      },
    };
    aktiv = modus;
    try {
      const r = modus.mount(flaeche, ctx);
      if (r instanceof Promise) {
        r.catch((f: unknown) => {
          if (nr === lauf) flaeche.append(fehlerHinweis(f));
          else console.error(f);
        });
      }
    } catch (f) {
      flaeche.append(fehlerHinweis(f));
    }
  }

  window.addEventListener('popstate', (ev) => {
    // Android-Zurück in einem Kind-Modus: wir landen auf dem Eintrag unter der Falle (gleicher Hash).
    // Falle neu stellen und bleiben — das Kind verlässt die Arbeit nicht aus Versehen.
    if (aktiv && !aktiv.fuerEltern && !istFalle(ev.state) && rahmenAktiv) {
      const { ziel, param } = leseHash();
      if (ziel === aktiv.id && hashFuer(ziel, param) === location.hash) {
        history.pushState({ falle: true }, '', location.hash);
        rahmenAktiv.dataset.falleGefangen = String(Number(rahmenAktiv.dataset.falleGefangen ?? '0') + 1);
        return;
      }
    }
    zeige();
  });
  // Immer auf dem Start beginnen (siehe Kopfkommentar).
  history.replaceState(null, '', location.pathname + location.search);
  zeige();
  return router;
}
