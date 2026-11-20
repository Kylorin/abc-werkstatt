/**
 * B14: Bildlicher Hinweis auf den Stummschalter (iPhone/iPad) für Eltern.
 * Auf iPhones schaltet der Schalter an der Seite den Ton von Web-Apps stumm — dann bleibt die
 * ABC-Werkstatt still, obwohl alles funktioniert.
 *
 * - `stummHinweis()` liefert die Karte (immer zeigbar, z. B. in den Einstellungen).
 * - `stummHinweisEinmal(ziel)` zeigt sie beim ersten Start einmal pro Gerät mit „Verstanden“
 *   (Merker in localStorage, nur eine Gerätebequemlichkeit). Einhängen macht der Start.
 */
import './stummhinweis.css';
import { el } from '../kern/dom';

const MERKER = 'abc-werkstatt-stummhinweis-gesehen';

const BILD =
  '<svg viewBox="0 0 120 64" width="120" height="64" aria-hidden="true" focusable="false">' +
  // Telefon von der Seite: Gehäuse, Lautstärketasten, Stummschalter (hervorgehoben)
  '<rect x="6" y="18" width="108" height="28" rx="10" fill="none" stroke="currentColor" stroke-width="2.5"/>' +
  '<rect x="30" y="12" width="12" height="7" rx="2" class="stummhinweis__schalter"/>' +
  '<rect x="50" y="13" width="16" height="5" rx="2" fill="currentColor" opacity=".35"/>' +
  '<rect x="70" y="13" width="16" height="5" rx="2" fill="currentColor" opacity=".35"/>' +
  '<path d="M36 9V2M31 5l5-4 5 4" fill="none" class="stummhinweis__pfeil" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';

export function stummHinweis(): HTMLElement {
  const bild = el('span', { klasse: 'stummhinweis__bild' });
  bild.innerHTML = BILD; // feste, eigene Grafik ohne Fremddaten
  return el('div', { klasse: 'stummhinweis', testid: 'stumm-hinweis' },
    bild,
    el('p', {
      klasse: 'stummhinweis__text',
      text:
        'Kein Ton? Am iPhone den Stummschalter an der Seite so stellen, dass kein Orange zu sehen ist ' +
        '(neuere iPhones: Stummmodus über die Aktionstaste oder das Kontrollzentrum aus). Dann die Lautstärke hochdrehen.',
    }),
  );
}

function gesehen(): boolean {
  try {
    return localStorage.getItem(MERKER) === 'ja';
  } catch {
    return false;
  }
}

/** Zeigt den Hinweis einmal pro Gerät in `ziel` (oben). Liefert true, wenn er gezeigt wurde. */
export function stummHinweisEinmal(ziel: HTMLElement): boolean {
  if (gesehen()) return false;
  const karte = stummHinweis();
  karte.classList.add('stummhinweis--einmal');
  karte.append(
    el('button', {
      klasse: 'knopf knopf--leise stummhinweis__ok',
      testid: 'stumm-hinweis-ok',
      text: 'Verstanden',
      beiKlick: () => {
        try {
          localStorage.setItem(MERKER, 'ja');
        } catch {
          /* ohne Speicher erscheint der Hinweis beim nächsten Start wieder — harmlos */
        }
        karte.remove();
      },
    }),
  );
  ziel.prepend(karte);
  return true;
}
