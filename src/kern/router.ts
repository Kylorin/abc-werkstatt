/**
 * Hash-Router (Fundament). Routen: `#/` Start, `#/<modus>`, `#/<modus>/<param>`.
 *
 * Beim Laden der Seite geht es IMMER auf den Start (Hash wird verworfen):
 * Ein Kind landet nach Neuladen nie mitten in den Einstellungen — und die Abnahme
 * verlässt sich darauf (Neuladen → Startseite).
 *
 * Der Router baut für jeden Modus den Rahmen: Kopfzeile mit `zurueck` (data-testid)
 * und Titel, darunter die Fläche, in die `modus.mount()` schreibt.
 */
import { el, fehlerHinweis, leeren } from './dom';
import { icon } from './ui/icons';
import { zeigeStart } from './start';
import type { Kontext, Modus, ModusId } from './vertrag';

export type Dienste = Omit<Kontext, 'navigiere' | 'param' | 'setzeTitel'>;

/** Wird nach jedem Bildschirmwechsel auf `window` ausgelöst (z. B. für aufgeschobene Updates). */
export const ROUTE_GEWECHSELT = 'abc-werkstatt:route';

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

export function starteRouter(wurzel: HTMLElement, dienste: Dienste, modi: readonly Modus[]): Router {
  const register = new Map<ModusId, Modus>(modi.map((m) => [m.id, m]));
  let aktiv: Modus | undefined;
  let lauf = 0; // verhindert, dass ein langsamer async-mount nach dem Weiternavigieren noch zeichnet

  const router: Router = {
    navigiere(ziel, param) {
      const neu = hashFuer(ziel, param);
      if (location.hash === neu) return zeige();
      history.pushState(null, '', neu);
      zeige();
    },
    aktuell: leseHash,
  };

  function verlasseAktiv(): void {
    dienste.audio.stopp();
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

    const titel = el('h1', { klasse: 'kopf__titel', text: modus.titel });
    const zurueck = el(
      'button',
      {
        klasse: 'knopf knopf--icon knopf--leise',
        testid: 'zurueck',
        attr: { 'aria-label': 'Zurück' },
        beiKlick: () => router.navigiere(modus.zurueckZu ?? 'start'),
      },
      icon('zurueck', { groesse: 28 }),
    );
    const flaeche = el('main', { klasse: 'flaeche', attr: { 'data-modus': modus.id } });
    const rahmen = el(
      'div',
      { klasse: 'rahmen', attr: { 'data-modus': modus.id } },
      el('header', { klasse: 'kopf' }, zurueck, titel, el('div', { klasse: 'kopf__platz' })),
      flaeche,
    );
    wurzel.append(rahmen);
    document.title = `${modus.titel} · ABC-Werkstatt`;

    const ctx: Kontext = {
      ...dienste,
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

  window.addEventListener('popstate', zeige);
  // Immer auf dem Start beginnen (siehe Kopfkommentar).
  history.replaceState(null, '', location.pathname + location.search);
  zeige();
  return router;
}
