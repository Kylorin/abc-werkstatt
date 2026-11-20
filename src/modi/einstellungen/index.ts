/**
 * Einstellungen (Bau „verwaltung“) — Erwachsenen-Bereich.
 * Laute ↔ Namen, Großbuchstaben, Tier-Modus mit/ohne Vorlage, Regal (B1), Lernpfad, Stimme und
 * Spracheingabe (B18), Kind (Anfangsbuchstabe, „heute dran“), Laut-Studio, Tier-Pakete, Speicher.
 * Abschnitte einzelner Arbeiten (z. B. „Meine Leute“) und Begleitkarten kommen aus den Modi selbst.
 * Jede Änderung wird sofort über den Einstellungs-Store gespeichert.
 */
import './einstellungen.css';
import { el, fehlerHinweis } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { speicherStand, type SpeicherStand } from '../../kern/speicher';
import { ELTERNSPERRE_SEKUNDEN } from '../../kern/elternsperre';
import type { Kontext, Modus } from '../../kern/vertrag';
import { abschnitt, ausDenModi, kindUndHeute, lernpfad, regal, schalter } from './abschnitte';
import { tonquellen } from './ton';

let abmelden: (() => void)[] = [];
let aktiv = false;

/** Zeigt, ob der Browser die Daten dauerhaft hält — sonst darf er Paket und Aufnahmen bei Platzmangel räumen. */
function speicher(ctx: Kontext): HTMLElement {
  const zeile = el('p', { klasse: 'einstellungen__hinweis', testid: 'speicher-stand', text: 'Speicher wird geprüft …' });
  const fehlerPlatz = el('div', { klasse: 'einstellungen__meldung' });
  let lauf = 0;
  // Nach Import oder Löschen eines Pakets neu messen — sonst bleibt die alte Zahl stehen.
  abmelden.push(ctx.pakete.abonniere(() => {
    if (aktiv) messe();
  }));
  messe();
  return abschnitt('Speicher', zeile, fehlerPlatz);

  function messe(): void {
    const nr = ++lauf;
    speicherStand().then(
      (st) => {
        if (!aktiv || nr !== lauf) return;
        fehlerPlatz.replaceChildren();
        zeigeStand(st);
      },
      (f: unknown) => {
        if (aktiv && nr === lauf) fehlerPlatz.replaceChildren(fehlerHinweis(f));
      },
    );
  }

  function zeigeStand(st: SpeicherStand): void {
    const mb = st.belegt !== undefined ? `, belegt ${(st.belegt / 1_000_000).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB` : '';
    if (st.dauerhaft === true) zeile.textContent = `Speicher dauerhaft: ja${mb}.`;
    else if (st.dauerhaft === false) {
      zeile.textContent =
        `Speicher dauerhaft: nein${mb}. Der Browser darf Tier-Pakete und eigene Aufnahmen bei Platzmangel löschen. ` +
        'Tipp: die App zum Startbildschirm hinzufügen und ein Paket importieren – dann fragt sie erneut.';
    } else zeile.textContent = `Dieses Gerät sagt nicht, ob der Speicher dauerhaft ist${mb}.`;
  }
}

function pakete(ctx: Kontext): HTMLElement {
  const liste = el('ul', { klasse: 'liste einstellungen__pakete', testid: 'paketliste' });
  const leer = el('p', { klasse: 'leise einstellungen__hinweis', text: 'Noch kein Tier-Paket installiert.' });
  const meldung = el('div', { klasse: 'einstellungen__meldung', testid: 'paket-meldung', attr: { 'aria-live': 'polite' } });
  let lauf = 0;

  async function zeige(): Promise<void> {
    const nr = ++lauf;
    const alle = await ctx.pakete.liste();
    if (!aktiv || nr !== lauf) return;
    liste.replaceChildren(
      ...alle.map((p) =>
        el('li', { klasse: 'liste__eintrag', attr: { 'data-paket': p.id } },
          el('span', { klasse: 'einstellungen__paket' },
            el('strong', { text: p.titel }),
            el('small', { klasse: 'leise', text: `${p.tiere.length} ${p.tiere.length === 1 ? 'Tier' : 'Tiere'}` }),
          ),
          el('button', {
            klasse: 'knopf knopf--leise knopf--icon knopf--gefahr',
            testid: `paket-loeschen-${p.id}`,
            attr: { 'aria-label': `${p.titel} löschen`, title: 'Paket löschen' },
            beiKlick: () => void loeschen(p.id),
          }, icon('loeschen')),
        ),
      ),
    );
    leer.hidden = alle.length > 0;
  }

  function neuZeigen(): void {
    zeige().catch((f: unknown) => {
      if (aktiv) meldung.replaceChildren(fehlerHinweis(f));
    });
  }

  /** Löschen ist rückholbar (Papierkorb im Paket-Dienst): danach steht hier „zurückholen“. */
  async function loeschen(id: string): Promise<void> {
    meldung.replaceChildren();
    const titel = (await ctx.pakete.hole(id))?.titel ?? id;
    try {
      await ctx.pakete.loesche(id);
    } catch (f) {
      if (aktiv) meldung.replaceChildren(fehlerHinweis(f));
      if (aktiv) neuZeigen();
      return;
    }
    if (!aktiv) return;
    neuZeigen();
    meldung.replaceChildren(
      el('div', { klasse: 'rueckgaengig', testid: 'paket-rueckgaengig' },
        el('span', { text: `„${titel}“ ist gelöscht.` }),
        el('button', {
          klasse: 'knopf',
          testid: `paket-zurueckholen-${id}`,
          beiKlick: () => {
            meldung.replaceChildren();
            ctx.pakete.stelleWiederHer(id).then(
              () => {
                if (aktiv) neuZeigen();
              },
              (f: unknown) => {
                if (aktiv) meldung.replaceChildren(fehlerHinweis(f));
              },
            );
          },
        }, icon('nochmal', { groesse: 20 }), el('span', { text: 'zurückholen' })),
      ),
    );
  }

  const datei = el('input', {
    klasse: 'sr-only',
    testid: 'paket-import',
    attr: { type: 'file', id: 'paket-import', accept: '.zip,application/zip' },
  });
  datei.addEventListener('change', () => {
    const dateien = [...(datei.files ?? [])];
    if (!dateien.length) return;
    void (async () => {
      meldung.replaceChildren(el('p', { klasse: 'leise', text: 'Paket wird geprüft …' }));
      const erfolge: HTMLElement[] = [];
      const fehler: HTMLElement[] = [];
      for (const d of dateien) {
        try {
          const p = await ctx.pakete.importiereZip(d);
          erfolge.push(el('p', { klasse: 'einstellungen__erfolg', text: `„${p.titel}“ ist installiert (${p.tiere.length} Tiere).` }));
        } catch (f) {
          fehler.push(fehlerHinweis(f));
        }
      }
      datei.value = '';
      if (!aktiv) return;
      meldung.replaceChildren(...erfolge, ...fehler);
      neuZeigen();
    })();
  });
  const knopf = el('label', { klasse: 'knopf', attr: { for: 'paket-import' } }, icon('hochladen'), el('span', { text: 'Paket hinzufügen (.zip)' }));
  // Tastaturbedienung: das Label selbst ist kein Fokusziel, das versteckte Feld schon.
  datei.addEventListener('focus', () => knopf.classList.add('einstellungen__fokus'));
  datei.addEventListener('blur', () => knopf.classList.remove('einstellungen__fokus'));

  abmelden.push(ctx.pakete.abonniere(() => {
    if (aktiv) neuZeigen();
  }));
  neuZeigen();

  return abschnitt('Tier-Pakete',
    el('p', {
      klasse: 'einstellungen__hinweis',
      text: 'Ein Tier-Paket bringt Tiere mit Bild und Namen zum Schreiben mit. Jedes Paket bekommt eine eigene Kachel auf dem Start.',
    }),
    liste,
    leer,
    el('div', {}, datei, knopf),
    meldung,
  );
}

export const modus: Modus = {
  id: 'einstellungen',
  titel: 'Einstellungen',
  icon: 'einstellungen',
  fuerEltern: true,
  mount(flaeche, ctx) {
    aktiv = true;
    flaeche.append(
      abschnitt('Lesen und Schreiben',
        schalter(ctx, 'namenStattLaute', 'einstellung-namen', 'Buchstabennamen statt Laute',
          'Aus: „mmm“ wie im Wort (Montessori). An: „em“.'),
        schalter(ctx, 'grossbuchstaben', 'einstellung-gross', 'Großbuchstaben',
          'Aus: kleine Buchstaben, wie sie in Büchern meist stehen.'),
        schalter(ctx, 'tierModusMitVorlage', 'einstellung-tier-vorlage', 'Tiere mit Vorlage',
          'An: das Wort steht als Vorlage da. Aus: aus dem Kopf schreiben.'),
        el('button', {
          klasse: 'knopf einstellungen__weiter',
          testid: 'laut-studio',
          beiKlick: () => ctx.navigiere('laut-studio'),
        }, icon('welle'), el('span', { text: 'Laut-Studio: Aussprache wählen' }), icon('weiter', { groesse: 20 })),
      ),
      abschnitt('Elternbereich',
        schalter(ctx, 'elternsperre', 'einstellung-elternsperre', 'Elternsperre',
          `In der installierten App öffnen sich Wörterbuch und Einstellungen erst, wenn man den Knopf ${ELTERNSPERRE_SEKUNDEN} Sekunden gedrückt hält. Ein kurzer Tipp des Kindes tut nichts.`),
      ),
      regal(ctx),
      lernpfad(ctx),
      kindUndHeute(ctx),
      tonquellen(ctx, (fn) => abmelden.push(fn), () => aktiv),
      pakete(ctx),
      ...ausDenModi(ctx),
      speicher(ctx),
    );
  },
  unmount() {
    aktiv = false;
    for (const fn of abmelden) fn();
    abmelden = [];
  },
};
