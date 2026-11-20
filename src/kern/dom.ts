/** Kleine DOM-Helfer, damit Modi ohne Framework übersichtlich bleiben (Fundament). */

type Kind = Node | string | null | undefined | false;

export interface ElOptionen {
  /** CSS-Klassen (String mit Leerzeichen oder Liste). */
  klasse?: string | string[];
  /** data-testid */
  testid?: string;
  /** Weitere Attribute (data-*, aria-*, type …). false/undefined wird weggelassen. */
  attr?: Record<string, string | number | boolean | undefined>;
  /** Textinhalt (statt Kinder). */
  text?: string;
  /** Klick-Handler. */
  beiKlick?: (ev: MouseEvent) => void;
}

/** Erzeugt ein Element: el('button', { klasse: 'knopf', testid: 'x', beiKlick }, kind1, kind2). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opt: ElOptionen = {},
  ...kinder: Kind[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (opt.klasse) e.className = Array.isArray(opt.klasse) ? opt.klasse.join(' ') : opt.klasse;
  if (opt.testid) e.dataset.testid = opt.testid;
  if (opt.attr) {
    for (const [k, v] of Object.entries(opt.attr)) {
      if (v === undefined || v === false) continue;
      e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  if (opt.text !== undefined) e.textContent = opt.text;
  const klick = opt.beiKlick;
  if (klick) (e as HTMLElement).addEventListener('click', (ev: MouseEvent) => klick(ev));
  for (const k of kinder) if (k) e.append(k);
  if (tag === 'button' && !e.hasAttribute('type')) e.setAttribute('type', 'button');
  return e;
}

/** Entfernt alle Kinder. */
export function leeren(e: Element): void {
  e.replaceChildren();
}

/**
 * Startet eine CSS-Animation (Klasse) neu, auch wenn sie gerade läuft,
 * und entfernt die Klasse nach animationend.
 */
export function animiere(e: Element, klasse: string): void {
  e.classList.remove(klasse);
  void (e as HTMLElement).offsetWidth;
  e.classList.add(klasse);
  e.addEventListener('animationend', () => e.classList.remove(klasse), { once: true });
}

/** Ruhige, sichtbare Fehlermeldung (für Eltern), statt still zu schlucken. Loggt zusätzlich. */
export function fehlerHinweis(fehler: unknown): HTMLElement {
  console.error(fehler);
  const text = fehler instanceof Error ? fehler.message : String(fehler);
  return el('p', { klasse: 'hinweis hinweis--fehler', attr: { role: 'alert' }, text });
}
