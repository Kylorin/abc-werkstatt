/**
 * Bildschirm-Alphabet — GRUNDFASSUNG vom Fundament, Bau „schreiben" verfeinert/ersetzt sie
 * (Export `erzeugeAlphabet` mit Signatur `ErzeugeAlphabet` bleibt).
 *
 * Tasten: <button class="taste" data-testid="taste-<b>" data-art="vokal|konsonant" data-buchstabe="<b>">
 * Vokale blau, Konsonanten rot (CSS in kern/stil/komponenten.css, Klasse .taste).
 */
import { LAUTE, type AlphabetKomponente, type Buchstabe, type ErzeugeAlphabet } from '../kern/vertrag';
import { anzeigeZeichen, artVon, buchstabeAusTaste } from '../kern/alphabet';
import { animiere, el } from '../kern/dom';
import { icon } from '../kern/ui/icons';

export const erzeugeAlphabet: ErzeugeAlphabet = (opt): AlphabetKomponente => {
  const tasten = new Map<Buchstabe, HTMLButtonElement>();
  const wurzel = el('div', { klasse: 'alphabet', attr: { role: 'group', 'aria-label': 'Alphabet' } });
  const raster = el('div', { klasse: 'alphabet__raster' });
  wurzel.append(raster);

  for (const b of LAUTE) {
    const t = el('button', {
      klasse: 'taste',
      testid: `taste-${b}`,
      attr: { 'data-art': artVon(b), 'data-buchstabe': b },
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
      leiste.append(el('button', { klasse: 'taste taste--leer', testid: 'taste-leer', attr: { 'aria-label': 'Leertaste' }, beiKlick: () => f() }, icon('leertaste', { groesse: 32 })));
    }
    if (opt.beiLoeschen) {
      const f = opt.beiLoeschen;
      leiste.append(el('button', { klasse: 'taste taste--zurueck', testid: 'taste-loeschen', attr: { 'aria-label': 'Letzten Buchstaben löschen' }, beiKlick: () => f() }, icon('rueckschritt', { groesse: 32 })));
    }
    wurzel.append(leiste);
  }

  const tastatur = (ev: KeyboardEvent): void => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const ziel = ev.target as HTMLElement | null;
    if (ziel && (ziel.tagName === 'INPUT' || ziel.tagName === 'TEXTAREA' || ziel.isContentEditable)) return;
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
    opt.beiTaste(b);
  };
  if (opt.tastatur !== false) document.addEventListener('keydown', tastatur);

  return {
    el: wurzel,
    wackle(b) {
      const t = tasten.get(b);
      if (t) animiere(t, 'wackelt');
    },
    setzeGross(gross) {
      for (const [b, t] of tasten) t.textContent = anzeigeZeichen(b, gross);
    },
    zerstoere() {
      document.removeEventListener('keydown', tastatur);
      wurzel.remove();
    },
  };
};
