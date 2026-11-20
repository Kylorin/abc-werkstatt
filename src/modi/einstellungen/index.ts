/**
 * Einstellungen (Bau „verwaltung“) — Erwachsenen-Bereich.
 * Laute ↔ Namen, Großbuchstaben, Tier-Modus mit/ohne Vorlage, Stimme + eigener Azure-Schlüssel,
 * Name des Kindes (nur Gerät), Laut-Studio, Tier-Pakete (Import, Liste, Löschen).
 * Jede Änderung wird sofort über den Einstellungs-Store gespeichert.
 */
import './einstellungen.css';
import { el, fehlerHinweis } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { speicherStand, type SpeicherStand } from '../../kern/speicher';
import { ELTERNSPERRE_SEKUNDEN } from '../../kern/elternsperre';
import type { Einstellungen, Kontext, Modus } from '../../kern/vertrag';

const STANDARD_REGION = 'germanywestcentral';

const REGIONEN: readonly [string, string][] = [
  ['germanywestcentral', 'Deutschland, West-Mitte'],
  ['westeurope', 'Westeuropa'],
  ['northeurope', 'Nordeuropa'],
  ['switzerlandnorth', 'Schweiz, Nord'],
  ['swedencentral', 'Schweden'],
  ['francecentral', 'Frankreich'],
];

const STIMMEN: readonly [string, string][] = [
  ['de-DE-KatjaNeural', 'Katja (ruhig, weiblich)'],
  ['de-DE-AmalaNeural', 'Amala (weiblich)'],
  ['de-DE-LouisaNeural', 'Louisa (weiblich)'],
  ['de-DE-ElkeNeural', 'Elke (weiblich)'],
  ['de-DE-KlarissaNeural', 'Klarissa (weiblich)'],
  ['de-DE-ConradNeural', 'Conrad (männlich)'],
  ['de-DE-KillianNeural', 'Killian (männlich)'],
  ['de-DE-GiselaNeural', 'Gisela (Kinderstimme)'],
];

let abmelden: (() => void)[] = [];
let aktiv = false;

type SchalterFeld = 'namenStattLaute' | 'grossbuchstaben' | 'tierModusMitVorlage' | 'elternsperre';

function schalter(ctx: Kontext, feld: SchalterFeld, testid: string, text: string, erklaerung: string): HTMLElement {
  const kasten = el('input', { testid, attr: { type: 'checkbox', role: 'switch' } });
  kasten.checked = ctx.einstellungen.lese()[feld];
  kasten.addEventListener('change', () => ctx.einstellungen.setze({ [feld]: kasten.checked } as Partial<Einstellungen>));
  return el('label', { klasse: 'schalter' },
    el('span', { klasse: 'einstellungen__text' },
      el('span', { text }),
      el('small', { klasse: 'leise', text: erklaerung }),
    ),
    kasten,
  );
}

function auswahl(optionen: readonly [string, string][], aktuell: string, testid: string): HTMLSelectElement {
  const liste = optionen.some(([w]) => w === aktuell) ? optionen : [...optionen, [aktuell, aktuell] as [string, string]];
  const s = el('select', { klasse: 'feld', testid },
    ...liste.map(([wert, name]) => el('option', { attr: { value: wert }, text: name })));
  s.value = aktuell;
  return s;
}

function abschnitt(titel: string, ...inhalt: HTMLElement[]): HTMLElement {
  return el('section', { klasse: 'abschnitt' }, el('h2', { klasse: 'abschnitt__titel', text: titel }), ...inhalt);
}

function stimmeUndAzure(ctx: Kontext): HTMLElement {
  const e = ctx.einstellungen.lese();
  const meldung = el('div', { klasse: 'einstellungen__meldung' });

  const stimme = auswahl(STIMMEN, e.stimme, 'einstellung-stimme');
  stimme.id = 'einstellung-stimme';
  stimme.addEventListener('change', () => ctx.einstellungen.setze({ stimme: stimme.value }));
  const probe = el('button', {
    klasse: 'knopf knopf--icon',
    testid: 'stimme-probe',
    attr: { 'aria-label': 'Stimme anhören', title: 'Stimme anhören' },
    beiKlick: () => {
      meldung.replaceChildren();
      ctx.audio.satz('Hallo! So klinge ich.').catch((f: unknown) => meldung.replaceChildren(fehlerHinweis(f)));
    },
  }, icon('lautsprecher'));

  const region = auswahl(REGIONEN, e.azureRegion ?? STANDARD_REGION, 'einstellung-azure-region');
  region.id = 'einstellung-azure-region';
  region.addEventListener('change', () => ctx.einstellungen.setze({ azureRegion: region.value }));

  const schluessel = el('input', {
    klasse: 'feld',
    testid: 'einstellung-azure-key',
    attr: { type: 'password', id: 'einstellung-azure-key', autocomplete: 'off', spellcheck: 'false', placeholder: 'Schlüssel einfügen' },
  });
  schluessel.value = e.azureSchluessel ?? '';
  schluessel.addEventListener('input', () => {
    const wert = schluessel.value.trim();
    const teil: Partial<Einstellungen> = { azureSchluessel: wert || undefined };
    if (wert && !ctx.einstellungen.lese().azureRegion) teil.azureRegion = region.value;
    ctx.einstellungen.setze(teil);
  });

  return abschnitt('Stimme',
    el('div', {},
      el('label', { klasse: 'beschriftung', attr: { for: 'einstellung-stimme' }, text: 'Vorlesestimme' }),
      el('div', { klasse: 'einstellungen__zeile' }, stimme, probe),
    ),
    el('div', {},
      el('label', { klasse: 'beschriftung', attr: { for: 'einstellung-azure-key' }, text: 'Eigener Azure-Speech-Schlüssel (optional)' }),
      schluessel,
    ),
    el('div', {},
      el('label', { klasse: 'beschriftung', attr: { for: 'einstellung-azure-region' }, text: 'Azure-Region' }),
      region,
    ),
    el('p', {
      klasse: 'einstellungen__hinweis',
      text:
        'Mit eigenem Schlüssel werden neue Wörter in der gewählten Stimme vorgelesen, sonst spricht die Stimme des Geräts. ' +
        'Der Schlüssel bleibt nur auf diesem Gerät. Der kostenlose Tarif F0 reicht völlig aus.',
    }),
    meldung,
  );
}

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

function kind(ctx: Kontext): HTMLElement {
  const name = el('input', {
    klasse: 'feld',
    testid: 'einstellung-kindname',
    attr: { type: 'text', id: 'einstellung-kindname', autocomplete: 'off', maxlength: 40, placeholder: 'optional' },
  });
  name.value = ctx.einstellungen.lese().kindName ?? '';
  name.addEventListener('input', () => ctx.einstellungen.setze({ kindName: name.value.trim() || undefined }));
  return abschnitt('Kind',
    el('div', {},
      el('label', { klasse: 'beschriftung', attr: { for: 'einstellung-kindname' }, text: 'Name des Kindes' }),
      name,
    ),
    el('p', { klasse: 'einstellungen__hinweis', text: 'Nur für eine persönliche Begrüßung. Bleibt auf diesem Gerät.' }),
  );
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
      stimmeUndAzure(ctx),
      pakete(ctx),
      speicher(ctx),
      kind(ctx),
    );
  },
  unmount() {
    aktiv = false;
    for (const fn of abmelden) fn();
    abmelden = [];
  },
};
