/**
 * „Gedrückt halten“-Knöpfe (Fundament): Elternsperre (2 s), Zurück in Kind-Modi (1 s, B7),
 * Wegräumen im Freien Schreiben (0,6 s, B5). Beim Halten füllt sich ein Ring/Balken
 * (CSS `.knopf--halten[data-halten='laeuft']`, Dauer über `--halten-dauer`).
 *
 * - Erst nach `ms` Halten wird `beiHalten` gerufen; ein kurzer Tipp ruft `beiKurz`.
 * - Tastatur (Enter/Leertaste → click mit detail 0) löst direkt aus — dort bedient ein Erwachsener.
 * - Nur der erste Zeiger zählt (Patschhand, B6).
 */
export interface HaltenOptionen {
  ms: number;
  beiHalten(): void;
  beiKurz?(): void;
}

export function mitHalten(knopf: HTMLElement, o: HaltenOptionen): () => void {
  let timer: number | undefined;
  let ausgeloest = false;
  let zeiger: number | undefined;
  const stopp = (): void => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    zeiger = undefined;
    delete knopf.dataset.halten;
  };
  knopf.classList.add('knopf--halten');
  knopf.style.setProperty('--halten-dauer', `${o.ms}ms`);
  const runter = (ev: PointerEvent): void => {
    if (ev.button !== 0 || zeiger !== undefined) return;
    zeiger = ev.pointerId;
    ausgeloest = false;
    knopf.dataset.halten = 'laeuft';
    timer = window.setTimeout(() => {
      timer = undefined;
      ausgeloest = true;
      delete knopf.dataset.halten;
      o.beiHalten();
    }, o.ms);
  };
  const ende = (ev: PointerEvent): void => {
    if (zeiger === undefined || ev.pointerId === zeiger) stopp();
  };
  const menue = (ev: Event): void => ev.preventDefault();
  const klick = (ev: MouseEvent): void => {
    ev.preventDefault();
    if (ev.detail === 0) {
      o.beiHalten();
      return;
    }
    if (!ausgeloest) o.beiKurz?.();
    ausgeloest = false;
  };
  knopf.addEventListener('pointerdown', runter);
  for (const e of ['pointerup', 'pointerleave', 'pointercancel'] as const) knopf.addEventListener(e, ende);
  knopf.addEventListener('contextmenu', menue);
  knopf.addEventListener('click', klick);
  return () => {
    stopp();
    knopf.removeEventListener('pointerdown', runter);
    for (const e of ['pointerup', 'pointerleave', 'pointercancel'] as const) knopf.removeEventListener(e, ende);
    knopf.removeEventListener('contextmenu', menue);
    knopf.removeEventListener('click', klick);
  };
}
