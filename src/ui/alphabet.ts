/**
 * Bewegliches Alphabet (Bau „schreiben“).
 *
 * Wie der Holzkasten: Buchstaben in Alphabet-Reihenfolge, Vokale blau, Konsonanten rot,
 * Umlaute zählen als Vokale. Tasten:
 *   <button class="taste" data-testid="taste-<b>" data-art="vokal|konsonant" data-buchstabe="<b>">
 * Die Anzeige folgt der Großbuchstaben-Einstellung, data-testid bleibt immer klein.
 *
 * Option `buchstaben` zeigt nur eine Auswahl (Nachfüllen, Tier-Stufen: Buchstaben des Worts +
 * Ablenker). Die echte Tastatur meldet trotzdem jeden Buchstaben, damit auch ein nicht gezeigter
 * Buchstabe sanft abgewiesen werden kann. `gross` macht wenige Tasten groß (2–6 Stück).
 *
 * Hilfe (B3): `hinweis(b, true)` lässt die gesuchte Taste pulsieren (`data-hinweis="ja"`,
 * Klasse `taste--hinweis`). Gesetzt wird das von der Wortarbeit nach `hilfeNach` Fehlversuchen.
 *
 * Patschhand-Schutz (B6), nur für Finger (`pointerType === 'touch'`):
 * - Es zählt nur der erste Finger. Solange er liegt, werden weitere Finger auf allen Tasten
 *   ignoriert (die ganze Hand auf dem Bildschirm schreibt keinen Buchstabensalat).
 * - Ausgelöst wird erst bei `pointerup`, und nur, wenn der Finger auf DERSELBEN Taste loslässt.
 *   Gleitet er auf eine andere Taste, passiert nichts.
 * - Ein Tipp auf eine ANDERE Taste innerhalb von 150 ms nach dem letzten Auslösen wird verworfen
 *   (zweiter Finger der Patschhand, der etwas später aufkommt).
 * - Der Klick, den der Browser nach einem Finger-Tipp nachschiebt, wird nicht doppelt gezählt.
 * Maus, Stift und Tastatur (Enter/Leertaste auf der Taste) lösen wie gewohnt per `click` aus.
 * Dazu `touch-action: manipulation` in alphabet.css (kein Doppeltipp-Zoom, keine Klick-Verzögerung).
 */
import { LAUTE, type AlphabetKomponente, type AlphabetOptionen, type Buchstabe, type ErzeugeAlphabet } from '../kern/vertrag';
import { anzeigeZeichen, artVon, buchstabeAusTaste } from '../kern/alphabet';
import { animiere, el } from '../kern/dom';
import { icon } from '../kern/ui/icons';
import './alphabet.css';

/** Früherer lokaler Name; `buchstaben` steht jetzt im Vertrag (AlphabetOptionen). */
export type AlphabetOptionenPlus = AlphabetOptionen;

/** B6: Tipps auf eine andere Taste so kurz nach dem letzten Auslösen gelten als Patschhand. */
export const PATSCH_SPERRE_MS = 150;
/** So lange nach einem Finger-Tipp wird der nachgeschobene Klick desselben Tipps ignoriert. */
const NACHKLICK_MS = 700;

export const erzeugeAlphabet = ((opt: AlphabetOptionenPlus): AlphabetKomponente => {
  const tasten = new Map<Buchstabe, HTMLButtonElement>();
  /** Jede bedienbare Taste (auch Leer-/Löschtaste) → was sie auslöst. */
  const aktionen = new Map<HTMLElement, () => void>();
  const zeigen = opt.buchstaben ? new Set(opt.buchstaben) : undefined;
  const auswahl = LAUTE.filter((b) => !zeigen || zeigen.has(b));

  const wurzel = el('div', {
    klasse: ['alphabet', zeigen ? 'alphabet--auswahl' : 'alphabet--voll', opt.gross ? 'alphabet--gross' : ''].filter(Boolean),
    attr: { role: 'group', 'aria-label': 'Bewegliches Alphabet' },
  });
  const raster = el('div', { klasse: 'alphabet__raster', attr: { 'data-anzahl': auswahl.length } });
  wurzel.append(raster);

  for (const b of auswahl) {
    const art = artVon(b);
    const t = el('button', {
      klasse: 'taste',
      testid: `taste-${b}`,
      attr: {
        'data-art': art,
        'data-buchstabe': b,
        'aria-label': tastenName(b, opt.grossbuchstaben),
      },
      text: anzeigeZeichen(b, opt.grossbuchstaben),
    });
    tasten.set(b, t);
    aktionen.set(t, () => opt.beiTaste(b));
    raster.append(t);
  }

  if (opt.beiLeertaste || opt.beiLoeschen) {
    const leiste = el('div', { klasse: 'alphabet__leiste' });
    if (opt.beiLeertaste) {
      const f = opt.beiLeertaste;
      const t = el('button', { klasse: 'taste taste--leer', testid: 'taste-leer', attr: { 'aria-label': 'Leertaste' } }, icon('leertaste', { groesse: 32 }));
      aktionen.set(t, () => f());
      leiste.append(t);
    }
    if (opt.beiLoeschen) {
      const f = opt.beiLoeschen;
      const t = el(
        'button',
        { klasse: 'taste taste--zurueck', testid: 'taste-loeschen', attr: { 'aria-label': 'Letzten Buchstaben löschen' } },
        icon('rueckschritt', { groesse: 32 }),
      );
      aktionen.set(t, () => f());
      leiste.append(t);
    }
    wurzel.append(leiste);
  }

  // --- Zeiger (B6) ----------------------------------------------------------
  /** Die Taste unter einem Ereignisziel (oder null außerhalb jeder Taste). */
  const tasteVon = (ziel: EventTarget | null): HTMLElement | null => {
    if (!(ziel instanceof Element)) return null;
    const t = ziel.closest<HTMLElement>('.taste');
    return t && aktionen.has(t) ? t : null;
  };

  /** Der erste Finger, der gerade liegt: nur er darf auslösen. */
  let finger: { id: number; taste: HTMLElement } | undefined;
  let letzteTaste: HTMLElement | undefined;
  let letzteZeit = -Infinity;
  /** Zeitpunkt des letzten Finger-Auslösens je Taste (gegen den nachgeschobenen Klick). */
  const fingerZeit = new WeakMap<HTMLElement, number>();

  const loese = (t: HTMLElement): void => {
    letzteTaste = t;
    letzteZeit = performance.now();
    aktionen.get(t)?.();
  };

  const runter = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'touch') return;
    const t = tasteVon(ev.target);
    if (!t) return;
    if (finger) return; // weiterer Finger, solange der erste liegt
    if (t !== letzteTaste && performance.now() - letzteZeit < PATSCH_SPERRE_MS) return;
    finger = { id: ev.pointerId, taste: t };
    // Implizites Pointer-Capture der Touch-Eingabe lösen: pointerup kommt dann auf dem Element unter dem Finger.
    if (t.hasPointerCapture(ev.pointerId)) t.releasePointerCapture(ev.pointerId);
  };
  const hoch = (ev: PointerEvent): void => {
    if (ev.pointerType !== 'touch' || !finger || ev.pointerId !== finger.id) return;
    const { taste } = finger;
    finger = undefined;
    const unter = tasteVon(ev.target);
    if (unter !== taste) return; // auf einer anderen Taste (oder daneben) losgelassen
    fingerZeit.set(taste, performance.now());
    loese(taste);
  };
  const abbruch = (ev: PointerEvent): void => {
    if (finger && ev.pointerId === finger.id) finger = undefined;
  };
  const klick = (ev: MouseEvent): void => {
    const t = tasteVon(ev.target);
    if (!t) return;
    // Finger-Tipps sind schon bei pointerup ausgelöst worden.
    if ((ev as PointerEvent).pointerType === 'touch') return;
    if (performance.now() - (fingerZeit.get(t) ?? -Infinity) < NACHKLICK_MS) return;
    loese(t);
  };
  wurzel.addEventListener('pointerdown', runter);
  wurzel.addEventListener('pointerup', hoch);
  wurzel.addEventListener('pointercancel', abbruch);
  wurzel.addEventListener('click', klick);

  // --- Echte Tastatur -------------------------------------------------------
  const tastatur = (ev: KeyboardEvent): void => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const ziel = ev.target as HTMLElement | null;
    if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.tagName === 'SELECT' || ziel.isContentEditable)) return;
    if (ev.key === 'Backspace' && opt.beiLoeschen) {
      ev.preventDefault();
      if (!ev.repeat) opt.beiLoeschen();
      return;
    }
    if (ev.key === ' ' && opt.beiLeertaste) {
      ev.preventDefault();
      if (!ev.repeat) opt.beiLeertaste();
      return;
    }
    const b = buchstabeAusTaste(ev.key);
    if (!b) return;
    ev.preventDefault();
    if (ev.repeat) return; // Festhalten erzeugt keine Buchstabenschlange
    const t = tasten.get(b);
    if (t) animiere(t, 'taste--gedrueckt');
    opt.beiTaste(b);
  };
  if (opt.tastatur !== false) document.addEventListener('keydown', tastatur);

  let zerstoert = false;
  return {
    el: wurzel,
    wackle(b) {
      const t = tasten.get(b);
      if (!t) return;
      t.classList.remove('taste--gedrueckt'); // Wackeln hat Vorrang vor dem Drück-Echo der Tastatur
      animiere(t, 'wackelt');
    },
    hinweis(b, an) {
      const t = tasten.get(b);
      if (!t) return;
      if (an) {
        t.dataset.hinweis = 'ja';
        t.classList.add('taste--hinweis');
      } else {
        delete t.dataset.hinweis;
        t.classList.remove('taste--hinweis');
      }
    },
    setzeGross(gross) {
      for (const [b, t] of tasten) {
        t.textContent = anzeigeZeichen(b, gross);
        t.setAttribute('aria-label', tastenName(b, gross));
      }
    },
    zerstoere() {
      if (zerstoert) return;
      zerstoert = true;
      finger = undefined;
      document.removeEventListener('keydown', tastatur);
      wurzel.removeEventListener('pointerdown', runter);
      wurzel.removeEventListener('pointerup', hoch);
      wurzel.removeEventListener('pointercancel', abbruch);
      wurzel.removeEventListener('click', klick);
      wurzel.remove();
    },
  };
}) satisfies ErzeugeAlphabet;

/** Die Taste eines Buchstabens innerhalb eines Alphabets (z. B. als Startpunkt für den Flug). */
export function tasteIn(alphabet: AlphabetKomponente, b: Buchstabe): HTMLElement | null {
  return alphabet.el.querySelector<HTMLElement>(`[data-buchstabe="${b}"]`);
}

function tastenName(b: Buchstabe, gross: boolean): string {
  return `${anzeigeZeichen(b, gross)}, ${artVon(b) === 'vokal' ? 'Vokal' : 'Konsonant'}`;
}
