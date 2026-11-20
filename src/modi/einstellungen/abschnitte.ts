/**
 * Abschnitte des Elternbereichs für Regal, Lernpfad, Tonquellen und Kind (Fundament).
 * Jede Änderung geht sofort in den Einstellungs-Store. Feature-Bauten fügen hier NICHTS ein,
 * sondern liefern `Modus.begleitkarte` bzw. `Modus.elternAbschnitt` (werden unten eingehängt).
 */
import { el, fehlerHinweis } from '../../kern/dom';
import { istBuchstabe } from '../../kern/alphabet';
import { icon } from '../../kern/ui/icons';
import {
  REGAL_ARBEITEN,
  REGAL_MAX,
  type Buchstabe,
  type Einstellungen,
  type Kontext,
  type LiveStimme,
  type Spracheingabe,
} from '../../kern/vertrag';

type BoolFeld = Exclude<{ [K in keyof Einstellungen]-?: Einstellungen[K] extends boolean ? K : never }[keyof Einstellungen], undefined>;

export function abschnitt(titel: string, ...inhalt: (HTMLElement | null)[]): HTMLElement {
  return el('section', { klasse: 'abschnitt' }, el('h2', { klasse: 'abschnitt__titel', text: titel }), ...inhalt);
}

export function schalter(ctx: Kontext, feld: BoolFeld, testid: string, text: string, erklaerung: string): HTMLElement {
  const kasten = el('input', { testid, attr: { type: 'checkbox', role: 'switch' } });
  kasten.checked = ctx.einstellungen.lese()[feld];
  kasten.addEventListener('change', () => ctx.einstellungen.setze({ [feld]: kasten.checked } as Partial<Einstellungen>));
  return el('label', { klasse: 'schalter' },
    el('span', { klasse: 'einstellungen__text' }, el('span', { text }), el('small', { klasse: 'leise', text: erklaerung })),
    kasten,
  );
}

function auswahl<T extends string | number>(
  testid: string,
  beschriftung: string,
  optionen: readonly [T, string][],
  aktuell: T,
  setze: (w: T) => void,
): HTMLElement {
  const s = el('select', { klasse: 'feld', testid, attr: { id: testid } },
    ...optionen.map(([wert, name]) => el('option', { attr: { value: String(wert) }, text: name })));
  s.value = String(aktuell);
  s.addEventListener('change', () => {
    const treffer = optionen.find(([w]) => String(w) === s.value);
    if (treffer) setze(treffer[0]);
  });
  return el('div', {}, el('label', { klasse: 'beschriftung', attr: { for: testid }, text: beschriftung }), s);
}

/** B1: Welche Arbeiten stehen im Regal (höchstens REGAL_MAX). */
export function regal(ctx: Kontext): HTMLElement {
  const nachId = new Map(ctx.modi.map((m) => [m.id, m]));
  const kaesten: HTMLInputElement[] = [];
  const aktualisiere = (): void => {
    const gewaehlt = ctx.einstellungen.lese().regal;
    for (const k of kaesten) {
      k.checked = gewaehlt.includes(k.value as never);
      k.disabled = !k.checked && gewaehlt.length >= REGAL_MAX;
    }
  };
  const zeilen = REGAL_ARBEITEN.filter((id) => nachId.has(id)).map((id) => {
    const m = nachId.get(id)!;
    const k = el('input', { testid: `einstellung-regal-${id}`, attr: { type: 'checkbox', role: 'switch', value: id } });
    kaesten.push(k);
    k.addEventListener('change', () => {
      const alt = ctx.einstellungen.lese().regal;
      const neu = k.checked ? [...alt.filter((x) => x !== id), id] : alt.filter((x) => x !== id);
      ctx.einstellungen.setze({ regal: neu.slice(0, REGAL_MAX) });
      aktualisiere();
    });
    return el('label', { klasse: 'schalter' },
      el('span', { klasse: 'einstellungen__text' }, el('span', { klasse: 'einstellungen__mit-icon' }, icon(m.icon, { groesse: 20 }), el('span', { text: m.titel }))),
      k,
    );
  });
  aktualisiere();
  return abschnitt('Regal',
    el('p', { klasse: 'einstellungen__hinweis', text: `Was hier an ist, steht für das Kind auf dem Start – höchstens ${REGAL_MAX} Arbeiten. Was fehlt, sieht das Kind nicht. Die App steigert nie von selbst.` }),
    el('div', { klasse: 'stapel', testid: 'einstellung-regal' }, ...zeilen),
  );
}

/** Lernpfad: Tier-Stufe, Hilfe, Gute Nacht, Laut ruft Tier, Decke, Geschichten, Elternzeilen. */
export function lernpfad(ctx: Kontext): HTMLElement {
  const e = ctx.einstellungen.lese();
  const setze = (teil: Partial<Einstellungen>): void => ctx.einstellungen.setze(teil);

  const kasten = el('input', {
    klasse: 'feld',
    testid: 'einstellung-kasten-buchstaben',
    attr: { id: 'einstellung-kasten-buchstaben', type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: 'leer = automatisch, z. B. m a i s' },
  });
  kasten.value = e.kastenBuchstaben.join(' ');
  kasten.addEventListener('change', () => {
    const liste = [...new Set(Array.from(kasten.value.toLocaleLowerCase('de-DE')).filter((z): z is Buchstabe => istBuchstabe(z)))].slice(0, 6);
    setze({ kastenBuchstaben: liste });
    kasten.value = liste.join(' ');
  });

  return abschnitt('Lernpfad',
    auswahl('einstellung-tier-stufe', 'Tiere schreiben: Stufe', [
      [1, '1 – nur den Anfang legen (2 Tasten)'],
      [2, '2 – Anfang und Ende (3 Tasten)'],
      [3, '3 – ganzes Wort mit Vorlage, kleine Auswahl'],
      [4, '4 – volles Alphabet'],
    ] as const, e.tierStufe, (w) => setze({ tierStufe: w })),
    auswahl('einstellung-hilfe-nach', 'Hilfe leuchtet nach', [
      [1, '1 Versuch'], [2, '2 Versuchen'], [3, '3 Versuchen'],
    ] as const, e.hilfeNach as 1 | 2 | 3, (w) => setze({ hilfeNach: w })),
    auswahl('einstellung-runden', 'Gute Nacht nach', [
      [3, '3 Runden'], [4, '4 Runden'], [6, '6 Runden'], [8, '8 Runden'], [10, '10 Runden'],
    ] as const, e.rundenBisGuteNacht as 3 | 4 | 6 | 8 | 10, (w) => setze({ rundenBisGuteNacht: w })),
    auswahl('einstellung-decke-stufe', 'Wer ist unter der Decke?', [
      [0, 'Stufe 0 – zwei Tierbilder zur Wahl'],
      [1, 'Stufe 1 – zwei Buchstaben zur Wahl'],
    ] as const, e.deckeStufe, (w) => setze({ deckeStufe: w })),
    schalter(ctx, 'lautRuftTier', 'einstellung-laut-ruft-tier', 'Laut ruft Tier',
      'Nach dem Laut einer Taste lugt ein Tier mit genau diesem Anlaut hervor.'),
    el('div', {},
      el('label', { klasse: 'beschriftung', attr: { for: 'einstellung-kasten-buchstaben' }, text: 'Kleiner Kasten („Laut ruft Tier“): 4–6 Buchstaben' }),
      kasten,
    ),
    schalter(ctx, 'geschichtenSchreiben', 'einstellung-geschichten-schreiben', 'Wer hilft?: Anfang legen',
      'Nach dem richtigen Helfer legt das Kind seinen ersten Buchstaben.'),
    schalter(ctx, 'elternzeilen', 'einstellung-elternzeilen', 'Elternzeilen zeigen',
      'Kleine graue Zeilen für Sie, z. B. „Klatscht mit!“.'),
  );
}

/** B18: Live-Stimme, Spracheingabe, eigener OpenRouter-Schlüssel. */
export function tonquellen(ctx: Kontext): HTMLElement {
  const e = ctx.einstellungen.lese();
  const meldung = el('div', { klasse: 'einstellungen__meldung', testid: 'tonquellen-meldung', attr: { 'aria-live': 'polite' } });

  const schluessel = el('input', {
    klasse: 'feld',
    testid: 'einstellung-openrouter-key',
    attr: { type: 'password', id: 'einstellung-openrouter-key', autocomplete: 'off', spellcheck: 'false', placeholder: 'Schlüssel einfügen (optional)' },
  });
  schluessel.value = e.openrouterSchluessel ?? '';
  schluessel.addEventListener('input', () => ctx.einstellungen.setze({ openrouterSchluessel: schluessel.value.trim() || undefined }));

  const probe = el('button', {
    klasse: 'knopf knopf--icon',
    testid: 'stimme-probe',
    attr: { 'aria-label': 'Live-Stimme anhören', title: 'Live-Stimme anhören' },
    beiKlick: () => {
      meldung.replaceChildren();
      ctx.audio.live('Hallo! So klinge ich.').catch((f: unknown) => meldung.replaceChildren(fehlerHinweis(f)));
    },
  }, icon('lautsprecher'));

  const live = auswahl<LiveStimme>('einstellung-livestimme', 'Live-Stimme für frei Geschriebenes', [
    ['browser', 'Stimme des Geräts'],
    ['piper', 'Offline-Stimme (einmal herunterladen)'],
    ['openrouter', 'OpenRouter (eigener Schlüssel, kostet)'],
  ], e.liveStimme, (w) => ctx.einstellungen.setze({ liveStimme: w }));

  const eingabe = auswahl<Spracheingabe>('einstellung-spracheingabe', 'Spracheingabe (nur für Eltern)', [
    ['aus', 'aus'],
    ['browser', 'über den Browser'],
    ['openrouter', 'über OpenRouter (eigener Schlüssel, kostet)'],
  ], e.spracheingabe, (w) => ctx.einstellungen.setze({ spracheingabe: w }));

  return abschnitt('Stimme und Spracheingabe',
    el('div', { klasse: 'einstellungen__zeile' }, live, probe),
    eingabe,
    el('div', {},
      el('label', { klasse: 'beschriftung', attr: { for: 'einstellung-openrouter-key' }, text: 'Eigener OpenRouter-Schlüssel' }),
      schluessel,
    ),
    el('p', {
      klasse: 'einstellungen__hinweis',
      testid: 'openrouter-hinweis',
      text:
        'Feste Sätze, Laute und Tierstimmen kommen immer aus Dateien in der App. Live gesprochen wird nur, was frei ' +
        'geschrieben wurde. Mit OpenRouter geht dieser Text (bzw. Ihre Spracheingabe) an OpenRouter und das Sprachmodell ' +
        '– jede Anfrage kostet ein paar Cent auf Ihrem Konto. Der Schlüssel bleibt nur auf diesem Gerät. ' +
        'Die Spracheingabe bewertet nie die Aussprache des Kindes.',
    }),
    meldung,
  );
}

/** Anfangsbuchstabe des Kindes (B16/F7) und „heute dran“. */
export function kindUndHeute(ctx: Kontext): HTMLElement {
  const anfang = el('input', {
    klasse: 'feld feld--kurz',
    testid: 'einstellung-kind-anfang',
    attr: { type: 'text', id: 'einstellung-kind-anfang', autocomplete: 'off', maxlength: 1, placeholder: 'z. B. m' },
  });
  anfang.value = ctx.einstellungen.lese().kindAnfang ?? '';
  anfang.addEventListener('input', () => {
    const z = anfang.value.trim().toLocaleLowerCase('de-DE');
    if (!z) ctx.einstellungen.setze({ kindAnfang: undefined });
    else if (istBuchstabe(z)) ctx.einstellungen.setze({ kindAnfang: z });
    anfang.value = ctx.einstellungen.lese().kindAnfang ?? '';
  });
  const notizen = ctx.notizen.heuteDran();
  const zeile = (art: string, titel: string): string | null => {
    const w = notizen.filter((n) => n.art === art).map((n) => n.wert);
    return w.length ? `${titel}: ${w.join(', ')}` : null;
  };
  const heute = [zeile('laut', 'Laute'), zeile('tier', 'Tiere'), zeile('wort', 'Wörter')].filter((z): z is string => z !== null);
  return abschnitt('Kind',
    el('div', {},
      el('label', { klasse: 'beschriftung', attr: { for: 'einstellung-kind-anfang' }, text: 'Anfangsbuchstabe des Kindes' }),
      anfang,
    ),
    el('p', { klasse: 'einstellungen__hinweis', text: 'Nur ein Buchstabe, bleibt auf diesem Gerät. Er kommt in den kleinen Kasten und zu „Meine Leute“.' }),
    el('p', {
      klasse: 'einstellungen__hinweis',
      testid: 'heute-dran',
      text: heute.length ? `Heute dran – ${heute.join(' · ')}` : 'Heute dran: noch nichts gespielt.',
    }),
  );
}

/** Begleitkarten (B16) und Elternabschnitte der Modi. */
export function ausDenModi(ctx: Kontext): HTMLElement[] {
  const karten = ctx.modi
    .filter((m) => m.begleitkarte)
    .map((m) => el('details', { klasse: 'begleitkarte', testid: `begleitkarte-${m.id}` },
      el('summary', { text: m.titel }),
      el('p', { klasse: 'einstellungen__hinweis', text: m.begleitkarte ?? '' })));
  const abschnitte = ctx.modi.flatMap((m) => {
    if (!m.elternAbschnitt) return [];
    try {
      return [m.elternAbschnitt(ctx)];
    } catch (f) {
      return [abschnitt(m.titel, fehlerHinweis(f))];
    }
  });
  return [...abschnitte, ...(karten.length ? [abschnitt('Begleitkarten', ...karten)] : [])];
}
