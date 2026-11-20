/**
 * Laut-Studio (Bau „verwaltung“): je Buchstabe die Aussprache-Varianten anhören und auswählen,
 * dazu eine eigene Aufnahme. Auswahl landet in Einstellungen.gewaehlteLautVarianten (Buchstabe → URL).
 * zurück → Einstellungen.
 */
import './laut-studio.css';
import { artVon } from '../../kern/alphabet';
import { el, fehlerHinweis } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { LAUTE, type Buchstabe, type Kontext, type LautVariante, type Modus } from '../../kern/vertrag';
import { aufnahmeKnoepfe, type AufnahmeKnoepfe } from './aufnahme';

const QUELLE: Record<LautVariante['quelle'], string> = {
  vorab: 'vorab vertont',
  aufnahme: 'eigene Aufnahme',
};

let aufnahmen: AufnahmeKnoepfe[] = [];
let abmelden: (() => void) | undefined;
let aktiv = false;

function zeile(ctx: Kontext, b: Buchstabe): HTMLElement {
  const varianten = el('div', { klasse: 'laut__varianten', attr: { role: 'group', 'aria-label': `Varianten für ${b}` } });
  const status = el('p', { klasse: 'laut__status leise' });
  const meldung = el('div');

  function markiere(): void {
    const gewaehlt = ctx.einstellungen.lese().gewaehlteLautVarianten[b];
    for (const k of varianten.querySelectorAll<HTMLButtonElement>('button[data-url]')) {
      k.setAttribute('aria-pressed', String(k.dataset.url === gewaehlt));
    }
    status.textContent = gewaehlt ? '' : 'Noch nichts gewählt – es klingt der Standardlaut.';
    standard.hidden = !gewaehlt;
  }

  const standard = el('button', {
    klasse: 'knopf knopf--leise laut__standard',
    testid: `standard-${b}`,
    text: 'Standard',
    beiKlick: () => {
      const neu = { ...ctx.einstellungen.lese().gewaehlteLautVarianten };
      delete neu[b];
      ctx.einstellungen.setze({ gewaehlteLautVarianten: neu });
      markiere();
    },
  });

  async function lade(): Promise<void> {
    meldung.replaceChildren();
    try {
      const liste = await ctx.audio.lautVarianten(b);
      if (!aktiv) return;
      varianten.replaceChildren(
        ...liste.map((v) =>
          el('button', {
            klasse: 'knopf laut__variante',
            testid: `variante-${b}-${v.id}`,
            attr: { 'data-url': v.url, 'data-quelle': v.quelle, 'aria-pressed': 'false', title: QUELLE[v.quelle] },
            beiKlick: () => {
              ctx.einstellungen.setze({
                gewaehlteLautVarianten: { ...ctx.einstellungen.lese().gewaehlteLautVarianten, [b]: v.url },
              });
              markiere();
              meldung.replaceChildren();
              ctx.audio.datei(v.url).catch((f: unknown) => meldung.replaceChildren(fehlerHinweis(f)));
            },
          }, icon('lautsprecher', { groesse: 20 }), el('span', { text: v.beschreibung ?? `Variante ${v.id}` })),
        ),
      );
      if (!liste.length) varianten.append(el('p', { klasse: 'leise', text: 'Keine Varianten vorhanden.' }));
      markiere();
    } catch (f) {
      if (aktiv) meldung.replaceChildren(fehlerHinweis(f));
    }
  }

  const aufnahme = aufnahmeKnoepfe(ctx.audio, { art: 'laut', text: b }, {
    testid: `laut-aufnahme-${b}`,
    beiAenderung: () => void lade(),
  });
  aufnahmen.push(aufnahme);

  void lade();
  return el('li', { klasse: 'karte laut', attr: { 'data-buchstabe': b } },
    el('div', { klasse: 'laut__kopf' },
      el('span', { klasse: ['laut__zeichen', artVon(b)], text: b }),
      status,
      standard,
    ),
    varianten,
    aufnahme.el,
    meldung,
  );
}

export const modus: Modus = {
  id: 'laut-studio',
  titel: 'Laut-Studio',
  icon: 'welle',
  fuerEltern: true,
  zurueckZu: 'einstellungen',
  mount(flaeche, ctx) {
    aktiv = true;
    const liste = el('ul', { klasse: 'liste laut-studio__liste', testid: 'laut-liste' }, ...LAUTE.map((b) => zeile(ctx, b)));
    flaeche.append(
      el('section', { klasse: 'abschnitt laut-studio' },
        el('p', {
          klasse: 'laut-studio__hinweis',
          text:
            'Nach Montessori lernt ein Kind zuerst den Laut („mmm“), nicht den Namen („em“), denn beim Schreiben ' +
            'setzt es Wörter aus dem zusammen, was es hört. Wählen Sie hier die Aussprache, die Ihnen am klarsten ' +
            'klingt, oder sprechen Sie den Laut selbst ein – Ihre Stimme hat dann Vorrang.',
        }),
        liste,
      ),
    );
    // Auswahl kann sich auch anderswo ändern (z. B. zweiter Tab) — Markierung nachziehen.
    abmelden = ctx.einstellungen.abonniere((e) => {
      for (const k of liste.querySelectorAll<HTMLButtonElement>('button[data-url]')) {
        const b = k.closest<HTMLElement>('[data-buchstabe]')?.dataset.buchstabe as Buchstabe | undefined;
        if (b) k.setAttribute('aria-pressed', String(k.dataset.url === e.gewaehlteLautVarianten[b]));
      }
    });
  },
  unmount() {
    aktiv = false;
    for (const a of aufnahmen) a.zerstoere();
    aufnahmen = [];
    abmelden?.();
    abmelden = undefined;
  },
};
