/**
 * Bewegliches Alphabet (Bau „schreiben").
 *
 * Wie der Holzkasten: Buchstaben in Alphabet-Reihenfolge, Vokale blau, Konsonanten rot,
 * Umlaute zählen als Vokale. Tasten:
 *   <button class="taste" data-testid="taste-<b>" data-art="vokal|konsonant" data-buchstabe="<b>">
 * Die Anzeige folgt der Großbuchstaben-Einstellung, data-testid bleibt immer klein.
 *
 * Option `buchstaben` (seit der Integration im Vertrag) zeigt nur eine
 * Auswahl (Nachfüllen: Buchstaben des Worts + Ablenker). Die echte Tastatur meldet trotzdem
 * jeden Buchstaben, damit auch ein nicht gezeigter Buchstabe sanft abgewiesen werden kann.
 */
import { LAUTE, type AlphabetKomponente, type AlphabetOptionen, type Buchstabe, type ErzeugeAlphabet } from '../kern/vertrag';
import { anzeigeZeichen, artVon, buchstabeAusTaste } from '../kern/alphabet';
import { animiere, el } from '../kern/dom';
import { icon } from '../kern/ui/icons';
import './alphabet.css';

/** Früherer lokaler Name; `buchstaben` steht jetzt im Vertrag (AlphabetOptionen). */
export type AlphabetOptionenPlus = AlphabetOptionen;

export const erzeugeAlphabet = ((opt: AlphabetOptionenPlus): AlphabetKomponente => {
  const tasten = new Map<Buchstabe, HTMLButtonElement>();
  const zeigen = opt.buchstaben ? new Set(opt.buchstaben) : undefined;
  const auswahl = LAUTE.filter((b) => !zeigen || zeigen.has(b));

  const wurzel = el('div', {
    klasse: ['alphabet', zeigen ? 'alphabet--auswahl' : 'alphabet--voll'],
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
      beiKlick: () => opt.beiTaste(b),
    });
    tasten.set(b, t);
    raster.append(t);
  }

  if (opt.beiLeertaste || opt.beiLoeschen) {
    const leiste = el('div', { klasse: 'alphabet__leiste' });
    if (opt.beiLeertaste) {
      const f = opt.beiLeertaste;
      leiste.append(
        el('button', { klasse: 'taste taste--leer', testid: 'taste-leer', attr: { 'aria-label': 'Leertaste' }, beiKlick: () => f() }, icon('leertaste', { groesse: 32 })),
      );
    }
    if (opt.beiLoeschen) {
      const f = opt.beiLoeschen;
      leiste.append(
        el(
          'button',
          { klasse: 'taste taste--zurueck', testid: 'taste-loeschen', attr: { 'aria-label': 'Letzten Buchstaben löschen' }, beiKlick: () => f() },
          icon('rueckschritt', { groesse: 32 }),
        ),
      );
    }
    wurzel.append(leiste);
  }

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
    setzeGross(gross) {
      for (const [b, t] of tasten) {
        t.textContent = anzeigeZeichen(b, gross);
        t.setAttribute('aria-label', tastenName(b, gross));
      }
    },
    zerstoere() {
      if (zerstoert) return;
      zerstoert = true;
      document.removeEventListener('keydown', tastatur);
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
