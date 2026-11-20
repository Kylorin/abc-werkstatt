/**
 * Elternaufnahme als kleine Knopfgruppe (Bau „verwaltung“) — genutzt im Laut-Studio (art 'laut')
 * und im Wörterbuch (art 'wort'). Ablauf: „selbst aufnehmen“ → „fertig“ → gespeichert;
 * danach „Aufnahme anhören“ ist die normale Ausgabe (die Aufnahme hat Vorrang) und „Aufnahme löschen“.
 */
import { el, fehlerHinweis } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { AudioDienst, AudioSchluessel, LaufendeAufnahme } from '../../kern/vertrag';

export interface AufnahmeKnoepfe {
  el: HTMLElement;
  /** Bricht eine laufende Aufnahme ab (Mikrofon frei). Idempotent. */
  zerstoere(): void;
}

export interface AufnahmeOptionen {
  /** Präfix für data-testid, z. B. „aufnahme-m“ → „aufnahme-m“, „aufnahme-m-loeschen“. */
  testid: string;
  /** Wird nach Speichern/Löschen aufgerufen (z. B. um Varianten neu zu laden). */
  beiAenderung?: () => void;
}

export function aufnahmeKnoepfe(audio: AudioDienst, schluessel: AudioSchluessel, opt: AufnahmeOptionen): AufnahmeKnoepfe {
  let laufend: LaufendeAufnahme | undefined;
  /** true, solange aufnahmeStarten() noch auf das Mikrofon wartet (z. B. Berechtigungsdialog). */
  let startet = false;
  let zerstoert = false;

  const meldung = el('div', { klasse: 'aufnahme__meldung' });
  const aufnehmen = el('button', {
    klasse: 'knopf knopf--leise aufnahme__knopf',
    testid: opt.testid,
    beiKlick: () => void umschalten(),
  });
  const loeschen = el('button', {
    klasse: 'knopf knopf--leise knopf--icon knopf--gefahr',
    testid: `${opt.testid}-loeschen`,
    attr: { 'aria-label': 'Eigene Aufnahme löschen', title: 'Eigene Aufnahme löschen', hidden: true },
    beiKlick: () => void entfernen(),
  }, icon('loeschen'));
  const wurzel = el('div', { klasse: 'aufnahme' }, aufnehmen, loeschen, meldung);

  function zeige(zustand: 'bereit' | 'laeuft' | 'vorhanden'): void {
    aufnehmen.replaceChildren(
      icon(zustand === 'laeuft' ? 'stopp' : 'mikrofon'),
      el('span', { text: zustand === 'laeuft' ? 'fertig' : zustand === 'vorhanden' ? 'neu aufnehmen' : 'selbst aufnehmen' }),
    );
    aufnehmen.dataset.zustand = zustand;
    aufnehmen.setAttribute('aria-pressed', String(zustand === 'laeuft'));
    loeschen.hidden = zustand !== 'vorhanden';
  }

  async function aktualisiere(): Promise<void> {
    const da = await audio.hatAufnahme(schluessel);
    if (!zerstoert && !laufend) zeige(da ? 'vorhanden' : 'bereit');
  }

  async function umschalten(): Promise<void> {
    // Ein zweiter Tipp während des Starts darf keine zweite Aufnahme öffnen (offenes Mikrofon).
    if (startet) return;
    meldung.replaceChildren();
    try {
      if (!laufend) {
        audio.stopp();
        startet = true;
        aufnehmen.disabled = true;
        let neu: LaufendeAufnahme;
        try {
          neu = await audio.aufnahmeStarten();
        } finally {
          startet = false;
          aufnehmen.disabled = false;
        }
        if (zerstoert) {
          neu.abbrechen();
          return;
        }
        laufend = neu;
        zeige('laeuft');
        return;
      }
      const aufnahme = laufend;
      laufend = undefined;
      const blob = await aufnahme.stoppe();
      await audio.aufnahmeSpeichern(schluessel, blob);
      if (zerstoert) return;
      zeige('vorhanden');
      opt.beiAenderung?.();
    } catch (f) {
      laufend?.abbrechen();
      laufend = undefined;
      if (zerstoert) return;
      meldung.replaceChildren(fehlerHinweis(f));
      void aktualisiere();
    }
  }

  async function entfernen(): Promise<void> {
    meldung.replaceChildren();
    try {
      await audio.aufnahmeLoeschen(schluessel);
      if (zerstoert) return;
      zeige('bereit');
      opt.beiAenderung?.();
    } catch (f) {
      if (!zerstoert) meldung.replaceChildren(fehlerHinweis(f));
    }
  }

  zeige('bereit');
  aktualisiere().catch((f: unknown) => {
    if (!zerstoert) meldung.replaceChildren(fehlerHinweis(f));
  });

  return {
    el: wurzel,
    zerstoere() {
      zerstoert = true;
      laufend?.abbrechen();
      laufend = undefined;
    },
  };
}
