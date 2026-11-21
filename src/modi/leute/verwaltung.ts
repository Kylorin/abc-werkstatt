/**
 * F7 „Meine Leute“ im Elternbereich (Bau „spiele“) — wird über `Modus.elternAbschnitt` in die
 * Einstellungen eingehängt (also hinter der Elternsperre).
 *
 * Anlegen: Wort (lautgetreu, nur Buchstaben des Alphabets), Foto (Kamera oder Datei, der Store
 * verkleinert auf ≈ 512 px), optional die eigene Aufnahme des Worts. Höchstens LEUTE_MAX Personen.
 * Alles bleibt in IndexedDB — kein localStorage, kein Export, kein Paket.
 * Je Eintrag: Foto tauschen (Tipp aufs Foto), umbenennen (Stift), anhören, neu aufnehmen, löschen.
 *
 * testids: leute-wort, leute-foto, leute-aufnahme, leute-kind, leute-anlegen, leute-liste,
 * leute-eintrag-<id>, leute-foto-tauschen-<id> (+ Datei-Feld leute-foto-<id>),
 * leute-umbenennen-<id> (+ leute-wort-<id>, leute-umbenennen-ok-<id>), leute-anhoeren-<id>,
 * leute-aufnahme-<id>, leute-loeschen-<id>.
 */
import { el, fehlerHinweis } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { LEUTE_MAX, type Kontext, type LaufendeAufnahme, type Person } from '../../kern/vertrag';
import { abschnitt } from '../einstellungen/abschnitte';

/** Aufnahme-Knopf: erster Klick startet, zweiter beendet und liefert die Aufnahme. */
function aufnahmeKnopf(ctx: Kontext, testid: string, text: string, fertig: (blob: Blob) => void, melde: (f: unknown) => void): HTMLButtonElement {
  let laufend: LaufendeAufnahme | undefined;
  let startet = false;
  const beschriftung = el('span', { text });
  const knopf = el(
    'button',
    {
      klasse: 'knopf knopf--leise',
      testid,
      attr: { 'aria-pressed': 'false' },
      beiKlick: () => {
        void (async () => {
          try {
            if (startet) return;
            if (!laufend) {
              startet = true;
              laufend = await ctx.audio.aufnahmeStarten();
              startet = false;
              knopf.setAttribute('aria-pressed', 'true');
              beschriftung.textContent = 'Aufnahme beenden';
              return;
            }
            const a = laufend;
            laufend = undefined;
            knopf.setAttribute('aria-pressed', 'false');
            beschriftung.textContent = text;
            fertig(await a.stoppe());
          } catch (f) {
            startet = false;
            laufend?.abbrechen();
            laufend = undefined;
            knopf.setAttribute('aria-pressed', 'false');
            beschriftung.textContent = text;
            melde(f);
          }
        })();
      },
    },
    icon('mikrofon'),
    beschriftung,
  );
  return knopf;
}

export function leuteVerwaltung(ctx: Kontext): HTMLElement {
  const meldung = el('div', { klasse: 'leute-verwaltung__meldung', attr: { 'aria-live': 'polite' } });
  const melde = (f: unknown): void => meldung.replaceChildren(fehlerHinweis(f));
  const sage = (text: string): void => meldung.replaceChildren(el('p', { klasse: 'einstellungen__hinweis', text }));

  const wort = el('input', {
    testid: 'leute-wort',
    attr: { id: 'leute-wort', type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: 20, placeholder: 'z. B. mama' },
  });
  const foto = el('input', { testid: 'leute-foto', attr: { id: 'leute-foto', type: 'file', accept: 'image/*' } });
  const kind = el('input', { testid: 'leute-kind', attr: { type: 'checkbox' } });
  let aufnahme: Blob | undefined;
  const aufnahmeStand = el('span', { klasse: 'leise', text: 'noch keine Aufnahme' });
  const aufnehmen = aufnahmeKnopf(ctx, 'leute-aufnahme', 'Wort aufnehmen', (blob) => {
    aufnahme = blob;
    aufnahmeStand.textContent = 'Aufnahme bereit';
  }, melde);

  const liste = el('ul', { klasse: 'leute-verwaltung__liste', testid: 'leute-liste' });
  const anlegen = el(
    'button',
    {
      klasse: 'knopf knopf--primaer',
      testid: 'leute-anlegen',
      beiKlick: () => {
        void (async () => {
          const datei = foto.files?.[0];
          if (!datei) {
            sage('Bitte zuerst ein Foto wählen.');
            return;
          }
          anlegen.disabled = true;
          try {
            await ctx.leute.anlegen({ wort: wort.value, foto: datei, ...(aufnahme ? { aufnahme } : {}), ...(kind.checked ? { kind: true } : {}) });
            wort.value = '';
            foto.value = '';
            kind.checked = false;
            aufnahme = undefined;
            aufnahmeStand.textContent = 'noch keine Aufnahme';
            meldung.replaceChildren();
          } catch (f) {
            melde(f);
          } finally {
            anlegen.disabled = false;
          }
        })();
      },
    },
    icon('plus'),
    el('span', { text: 'Anlegen' }),
  );

  async function zeichneListe(): Promise<void> {
    const leute = await ctx.leute.liste();
    const zeilen = await Promise.all(leute.map(async (p) => zeile(p, await ctx.leute.fotoUrl(p.id))));
    liste.replaceChildren(...zeilen);
    anlegen.disabled = leute.length >= LEUTE_MAX;
    if (leute.length >= LEUTE_MAX) sage(`Es sind schon ${LEUTE_MAX} Personen da.`);
  }

  function zeile(p: Person, fotoUrl: string): HTMLElement {
    const hoeren = el(
      'button',
      {
        klasse: 'knopf knopf--leise knopf--icon',
        testid: `leute-anhoeren-${p.id}`,
        attr: { 'aria-label': `${p.wort} anhören`, title: 'Anhören' },
        beiKlick: () => {
          void (async () => {
            const url = p.hatAufnahme ? await ctx.leute.aufnahmeUrl(p.id) : undefined;
            await (url ? ctx.audio.datei(url) : ctx.audio.wort(p.wort));
          })().catch(melde);
        },
      },
      icon('abspielen'),
    );
    const neuAufnehmen = aufnahmeKnopf(ctx, `leute-aufnahme-${p.id}`, p.hatAufnahme ? 'Neu aufnehmen' : 'Aufnehmen', (blob) => {
      ctx.leute.aendern(p.id, { aufnahme: blob }).catch(melde);
    }, melde);
    // Foto tauschen: Tipp aufs Foto öffnet die Auswahl (Kamera oder Datei), der Store verkleinert.
    const neuesFoto = el('input', { klasse: 'sr-only', testid: `leute-foto-${p.id}`, attr: { type: 'file', accept: 'image/*', tabindex: '-1' } });
    neuesFoto.addEventListener('change', () => {
      const datei = neuesFoto.files?.[0];
      if (!datei) return;
      ctx.leute.aendern(p.id, { foto: datei }).then(() => sage('Foto getauscht.'), melde);
    });
    const fotoKnopf = el(
      'button',
      {
        klasse: 'leute-verwaltung__foto-knopf',
        testid: `leute-foto-tauschen-${p.id}`,
        attr: { 'aria-label': `Foto von ${p.wort} tauschen`, title: 'Foto tauschen' },
        beiKlick: () => neuesFoto.click(),
      },
      el('img', { klasse: 'leute-verwaltung__foto', attr: { src: fotoUrl, alt: '' } }),
      el('span', { klasse: 'leute-verwaltung__foto-marke', attr: { 'aria-hidden': 'true' } }, icon('hochladen', { groesse: 16 })),
    );

    // Umbenennen: das Wort wird zum Eingabefeld; Enter oder Haken speichert, Escape bricht ab.
    const wortAnzeige = el('span', { klasse: 'leute-verwaltung__wort', text: p.kind ? `${p.wort} (Kind)` : p.wort });
    const wortPlatz = el('span', { klasse: 'leute-verwaltung__wort-platz' }, wortAnzeige);
    const umbenennen = el(
      'button',
      {
        klasse: 'knopf knopf--leise knopf--icon',
        testid: `leute-umbenennen-${p.id}`,
        attr: { 'aria-label': `${p.wort} umbenennen`, title: 'Umbenennen' },
        beiKlick: () => {
          const feld = el('input', {
            klasse: 'leute-verwaltung__wort-feld',
            testid: `leute-wort-${p.id}`,
            attr: { type: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', maxlength: 20, value: p.wort, 'aria-label': 'Neues Wort' },
          });
          const zurueck = (): void => {
            wortPlatz.replaceChildren(wortAnzeige);
            umbenennen.hidden = false;
          };
          const speichern = (): void => {
            const neu = feld.value.trim();
            if (!neu || neu === p.wort) {
              zurueck();
              return;
            }
            ctx.leute.aendern(p.id, { wort: neu }).then(
              () => sage(p.hatAufnahme ? 'Neues Wort gespeichert. Die Aufnahme sagt noch das alte Wort – bitte neu aufnehmen.' : 'Neues Wort gespeichert.'),
              melde,
            );
          };
          feld.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') speichern();
            else if (ev.key === 'Escape') zurueck();
          });
          const ok = el(
            'button',
            { klasse: 'knopf knopf--icon', testid: `leute-umbenennen-ok-${p.id}`, attr: { 'aria-label': 'Wort speichern', title: 'Speichern' }, beiKlick: speichern },
            icon('haken'),
          );
          wortPlatz.replaceChildren(feld, ok);
          umbenennen.hidden = true;
          feld.focus();
          feld.select();
        },
      },
      icon('frei'),
    );
    return el(
      'li',
      { klasse: 'leute-verwaltung__eintrag', testid: `leute-eintrag-${p.id}` },
      fotoKnopf,
      neuesFoto,
      wortPlatz,
      umbenennen,
      hoeren,
      neuAufnehmen,
      el(
        'button',
        {
          klasse: 'knopf knopf--leise knopf--icon knopf--gefahr',
          testid: `leute-loeschen-${p.id}`,
          attr: { 'aria-label': `${p.wort} löschen`, title: 'Löschen' },
          beiKlick: () => void ctx.leute.loeschen(p.id).catch(melde),
        },
        icon('loeschen'),
      ),
    );
  }

  const wurzel = abschnitt(
    'Meine Leute',
    el('p', {
      klasse: 'einstellungen__hinweis',
      text: `Bis zu ${LEUTE_MAX} Personen mit Foto, Wort und deiner Aufnahme. Alles bleibt nur auf diesem Gerät und kommt in keinen Export.`,
    }),
    el('div', { klasse: 'leute-verwaltung__form' },
      el('label', { klasse: 'beschriftung', attr: { for: 'leute-wort' }, text: 'Wort (so, wie man es hört)' }),
      wort,
      el('label', { klasse: 'beschriftung', attr: { for: 'leute-foto' }, text: 'Foto' }),
      foto,
      el('div', { klasse: 'zeile' }, aufnehmen, aufnahmeStand),
      el('label', { klasse: 'zeile' }, kind, el('span', { text: 'Eintrag für das Kind selbst' })),
      anlegen,
    ),
    meldung,
    liste,
  );
  wurzel.classList.add('leute-verwaltung');
  wurzel.dataset.testid = 'leute-verwaltung';

  // Kein unmount für Elternabschnitte: das Abo meldet sich ab, sobald der Abschnitt nicht mehr im Dokument hängt.
  let warDrin = false;
  const abmelden = ctx.leute.abonniere(() => {
    if (warDrin && !wurzel.isConnected) {
      abmelden();
      return;
    }
    void zeichneListe().catch(melde);
  });
  requestAnimationFrame(() => {
    warDrin = wurzel.isConnected;
  });
  void zeichneListe().catch(melde);
  return wurzel;
}
