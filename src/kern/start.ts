/**
 * Startseite (Fundament, data-testid="start").
 * Oben – falls installiert – groß die Tier-Pakete (Titel + Cover aus dem Paket),
 * darunter die Arbeiten des Kindes, unten leise der Elternbereich (Wörterbuch, Einstellungen).
 * Das Wörterbuch ist bewusst KEINE große Kachel: für ein Kind, das nicht liest, sähe es aus
 * wie eine weitere Arbeit — dort kann man aber Wörter löschen.
 */
import { el, fehlerHinweis } from './dom';
import { icon } from './ui/icons';
import type { Dienste } from './router';
import type { Modus, ModusId, TierPaket } from './vertrag';

type Navigiere = (ziel: ModusId | 'start', param?: string) => void;

/** Reihenfolge der Kacheln für die Arbeiten des Kindes. */
const ARBEITEN: readonly ModusId[] = ['frei', 'nachfuellen'];
/** Elternbereich: leise Knöpfe im Fuß. */
const ELTERN: readonly ModusId[] = ['woerterbuch', 'einstellungen'];

export function zeigeStart(wurzel: HTMLElement, dienste: Dienste, modi: readonly Modus[], navigiere: Navigiere): void {
  const nachId = new Map(modi.map((m) => [m.id, m]));
  const tierBereich = el('section', { klasse: 'start__tiere', attr: { 'aria-label': 'Tiere' } });

  const arbeiten = el('nav', { klasse: 'start__arbeiten', attr: { 'aria-label': 'Arbeiten' } });
  for (const id of ARBEITEN) {
    const m = nachId.get(id);
    if (!m) continue;
    arbeiten.append(
      el(
        'button',
        { klasse: `kachel kachel--${id}`, testid: `modus-${id}`, beiKlick: () => navigiere(id) },
        el('span', { klasse: 'kachel__icon' }, icon(m.icon, { groesse: 44, strich: 1.6 })),
        el('span', { klasse: 'kachel__titel', text: m.titel }),
      ),
    );
  }

  const fuss = el('footer', { klasse: 'start__fuss', attr: { 'aria-label': 'Für Eltern' } });
  for (const id of ELTERN) {
    const m = nachId.get(id);
    if (!m) continue;
    fuss.append(
      el(
        'button',
        { klasse: 'knopf knopf--leise', testid: id === 'einstellungen' ? 'einstellungen' : `modus-${id}`, beiKlick: () => navigiere(id) },
        icon(m.icon, { groesse: 24 }),
        el('span', { text: m.titel }),
      ),
    );
  }

  const seite = el(
    'div',
    { klasse: 'start', testid: 'start' },
    el(
      'header',
      { klasse: 'start__kopf' },
      el('h1', { klasse: 'start__titel' }, el('span', { klasse: 'vokal', text: 'a' }), el('span', { klasse: 'konsonant', text: 'b' }), el('span', { klasse: 'konsonant', text: 'c' }), ' Werkstatt'),
    ),
    tierBereich,
    arbeiten,
    fuss,
  );
  wurzel.append(seite);

  if (nachId.has('tiere')) void zeigeTiere(tierBereich, dienste, navigiere);
}

async function zeigeTiere(bereich: HTMLElement, dienste: Dienste, navigiere: Navigiere): Promise<void> {
  let pakete: TierPaket[];
  try {
    pakete = await dienste.pakete.liste();
  } catch (f) {
    bereich.append(fehlerHinweis(f));
    return;
  }
  for (const p of pakete) {
    const bild = el('span', { klasse: 'kachel__bild' });
    const kachel = el(
      'button',
      {
        klasse: 'kachel kachel--tiere',
        testid: 'modus-tiere',
        attr: { 'data-paket': p.id },
        beiKlick: () => navigiere('tiere', p.id),
      },
      bild,
      el(
        'span',
        { klasse: 'kachel__text' },
        el('span', { klasse: 'kachel__titel', text: p.titel }),
        p.untertitel ? el('span', { klasse: 'kachel__untertitel', text: p.untertitel }) : null,
      ),
    );
    bereich.append(kachel);
    if (p.cover) {
      dienste.pakete
        .bildUrl(p.id, p.cover)
        .then((url) => bild.append(el('img', { attr: { src: url, alt: '', decoding: 'async' } })))
        .catch((f: unknown) => {
          // Cover fehlt oder ist unlesbar: Tier-Icon statt leerer Fläche, und die Eltern sehen warum.
          bild.replaceChildren(icon('tiere', { groesse: 56, strich: 1.5 }));
          bereich.append(fehlerHinweis(f));
        });
    } else {
      bild.append(icon('tiere', { groesse: 56, strich: 1.5 }));
    }
  }
}
