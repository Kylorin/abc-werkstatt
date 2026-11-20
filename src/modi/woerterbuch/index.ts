/**
 * Wörterbuch (Bau „verwaltung") — Erwachsenen-Bereich: Wörter hinzufügen, löschen,
 * fürs Üben an-/abwählen, anhören und selbst einsprechen.
 *
 * Speicher: Wörter über den Kern-WoerterDienst (IndexedDB). Die Üben-Auswahl liegt in
 * localStorage unter PAUSIERT_SCHLUESSEL (Liste der abgewählten Wörter), bis der Kern sie
 * übernimmt (Kernwunsch: WoerterDienst.zufall() soll pausierte Wörter überspringen).
 */
import './woerterbuch.css';
import { schreibwort } from '../../kern/alphabet';
import { el, fehlerHinweis } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { WortFehler, type Kontext, type Modus } from '../../kern/vertrag';
import { pruefeWort } from '../../kern/woerter';
import { aufnahmeKnoepfe, type AufnahmeKnoepfe } from '../laut-studio/aufnahme';

/** localStorage-Schlüssel der fürs Üben abgewählten Wörter (JSON string[]). */
export const PAUSIERT_SCHLUESSEL = 'abc-werkstatt:woerter-pausiert:v1';

function lesePausiert(): Set<string> {
  const roh = localStorage.getItem(PAUSIERT_SCHLUESSEL);
  if (!roh) return new Set();
  const wert: unknown = JSON.parse(roh);
  if (!Array.isArray(wert)) throw new Error('Gespeicherte Üben-Auswahl ist beschädigt.');
  return new Set(wert.filter((w): w is string => typeof w === 'string'));
}

function speicherePausiert(menge: Set<string>): void {
  localStorage.setItem(PAUSIERT_SCHLUESSEL, JSON.stringify([...menge].sort((a, b) => a.localeCompare(b, 'de'))));
}

let aufnahmen = new Map<string, AufnahmeKnoepfe>();
let aktiv = false;

export const modus: Modus = {
  id: 'woerterbuch',
  titel: 'Wörterbuch',
  icon: 'woerterbuch',
  async mount(flaeche, ctx: Kontext) {
    aktiv = true;
    const pausiert = lesePausiert();
    const meldung = el('div', { klasse: 'woerterbuch__meldung' });
    const liste = el('ul', { klasse: 'liste woerterbuch__liste', testid: 'wortliste' });
    const leer = el('p', { klasse: 'hinweis', text: 'Noch keine Wörter. Oben ein Wort eintragen.' });
    /** Lebende Zeilen je Wort (gelöschte sind nicht mehr drin). */
    const zeilen = new Map<string, HTMLLIElement>();

    function zeigeFehler(f: unknown): void {
      meldung.replaceChildren(fehlerHinweis(f));
    }

    function aktualisiereLeer(): void {
      leer.hidden = zeilen.size > 0;
    }

    function zeile(wort: string): HTMLLIElement {
      const ueben = el('button', {
        klasse: 'knopf knopf--icon woerterbuch__ueben',
        testid: `wort-ueben-${wort}`,
        attr: {
          'aria-pressed': String(!pausiert.has(wort)),
          'aria-label': `${wort} üben`,
          title: 'beim Üben verwenden',
        },
        beiKlick: () => {
          if (pausiert.has(wort)) pausiert.delete(wort);
          else pausiert.add(wort);
          speicherePausiert(pausiert);
          ueben.setAttribute('aria-pressed', String(!pausiert.has(wort)));
          li.dataset.pausiert = pausiert.has(wort) ? 'ja' : 'nein';
        },
      }, icon('haken', { groesse: 20 }));

      const anhoeren = el('button', {
        klasse: 'knopf knopf--leise knopf--icon',
        testid: `wort-anhoeren-${wort}`,
        attr: { 'aria-label': `${wort} anhören`, title: 'anhören' },
        beiKlick: () => {
          meldung.replaceChildren();
          ctx.audio.wort(wort).catch(zeigeFehler);
        },
      }, icon('lautsprecher', { groesse: 20 }));

      const aufnahme = aufnahmeKnoepfe(ctx.audio, { art: 'wort', text: wort }, { testid: `wort-aufnahme-${wort}` });
      aufnahmen.set(wort, aufnahme);

      const loeschen = el('button', {
        klasse: 'knopf knopf--leise knopf--icon knopf--gefahr',
        testid: `wort-loeschen-${wort}`,
        attr: { 'aria-label': `${wort} löschen`, title: 'löschen' },
        beiKlick: () => void entferne(wort),
      }, icon('loeschen', { groesse: 20 }));

      const li = el('li', { klasse: 'liste__eintrag woerterbuch__eintrag', attr: { 'data-wort': wort, 'data-pausiert': pausiert.has(wort) ? 'ja' : 'nein' } },
        el('span', { klasse: 'woerterbuch__wort', text: wort }),
        el('div', { klasse: 'woerterbuch__knoepfe' }, ueben, anhoeren, loeschen),
        aufnahme.el,
      );
      return li;
    }

    /** Fügt eine Zeile alphabetisch ein. */
    function einfuegen(wort: string): void {
      const li = zeile(wort);
      zeilen.set(wort, li);
      const nach = [...zeilen.entries()]
        .filter(([w]) => w !== wort && w.localeCompare(wort, 'de') > 0)
        .sort(([a], [b]) => a.localeCompare(b, 'de'))[0];
      if (nach) liste.insertBefore(li, nach[1]);
      else liste.append(li);
      aktualisiereLeer();
    }

    async function entferne(wort: string): Promise<void> {
      meldung.replaceChildren();
      const li = zeilen.get(wort);
      if (!li) return;
      try {
        await ctx.woerter.loeschen(wort);
      } catch (f) {
        zeigeFehler(f);
        return;
      }
      zeilen.delete(wort);
      aufnahmen.get(wort)?.zerstoere();
      aufnahmen.delete(wort);
      if (pausiert.delete(wort)) speicherePausiert(pausiert);
      // Gelöschte Zeile wird bis zum nächsten Öffnen zu einem leeren, versteckten Platzhalter:
      // so verschiebt sich die Position der übrigen Löschknöpfe nicht (Serienlöschen per Index,
      // wie im Abnahmetest), und das Wort taucht im Text der Liste nicht mehr auf.
      const platzhalter = el('li', { attr: { hidden: true, 'aria-hidden': 'true' } },
        el('button', { testid: `wort-loeschen-${wort}~entfernt`, attr: { hidden: true, tabindex: -1 } }));
      li.replaceWith(platzhalter);
      aktualisiereLeer();
      if (!aktiv) return;
      ctx.audio.aufnahmeLoeschen({ art: 'wort', text: wort }).catch(zeigeFehler);
    }

    const eingabe = el('input', {
      klasse: 'feld',
      testid: 'wort-eingabe',
      attr: {
        type: 'text',
        inputmode: 'text',
        autocomplete: 'off',
        autocapitalize: 'off',
        spellcheck: 'false',
        maxlength: 20,
        'aria-label': 'Neues Wort',
        placeholder: 'neues Wort, z. B. igel',
      },
    });
    const formular = el('form', { klasse: 'woerterbuch__neu' },
      eingabe,
      el('button', { klasse: 'knopf knopf--primaer', testid: 'wort-hinzufuegen', attr: { type: 'submit' } },
        icon('plus', { groesse: 20 }), el('span', { text: 'hinzufügen' })),
    );
    formular.addEventListener('submit', (ev) => {
      ev.preventDefault();
      void (async () => {
        meldung.replaceChildren();
        try {
          const wort = pruefeWort(eingabe.value);
          if (zeilen.has(wort)) throw new WortFehler(`„${wort}" steht schon im Wörterbuch.`);
          await ctx.woerter.hinzufuegen(wort);
          if (!aktiv) return;
          einfuegen(wort);
          eingabe.value = '';
          eingabe.focus();
        } catch (f) {
          if (aktiv) zeigeFehler(f);
        }
      })();
    });
    // Normalisierung schon beim Tippen sichtbar machen (klein, ohne Leerzeichen).
    eingabe.addEventListener('input', () => {
      const normal = schreibwort(eingabe.value).replace(/\s+/g, '');
      if (normal !== eingabe.value) eingabe.value = normal;
    });

    flaeche.append(
      el('section', { klasse: 'abschnitt woerterbuch' },
        el('p', {
          klasse: 'woerterbuch__hinweis',
          text: 'Wörter, die Ihr Kind beim Nachfüllen schreibt. Der Haken bestimmt, ob ein Wort beim Üben drankommt.',
        }),
        formular,
        meldung,
        liste,
        leer,
      ),
    );

    const woerter = await ctx.woerter.liste();
    if (!aktiv) return;
    for (const w of woerter) {
      const li = zeile(w);
      zeilen.set(w, li);
      liste.append(li);
    }
    aktualisiereLeer();
  },
  unmount() {
    aktiv = false;
    for (const a of aufnahmen.values()) a.zerstoere();
    aufnahmen = new Map();
  },
};
