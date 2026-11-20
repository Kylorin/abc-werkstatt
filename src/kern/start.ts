/**
 * Startseite = Regal (Fundament, B1, data-testid="start").
 *
 * Für das Kind höchstens REGAL_MAX große Bildkacheln — genau die Arbeiten, die Papa im Elternbereich
 * ins Regal gestellt hat (`einstellungen.regal`). Was nicht im Regal steht, fehlt einfach (nicht
 * ausgegraut). Ein Modus kann mehrere Kacheln liefern (`Modus.kacheln`, z. B. eine je Tier-Paket)
 * oder gar keine (z. B. Geschichten ohne Paket mit Situationen).
 *
 * Bedienung einer Kachel (`modus-<id>`):
 * - erster Tipp: spricht `kachel.<id>` und merkt sich die Kachel (`data-bereit="ja"`),
 * - zweiter Tipp auf dieselbe Kachel ODER Halten (0,6 s) öffnet, Enter (Tastatur) öffnet direkt.
 *
 * Unten leise der Elternbereich (Wörterbuch, Einstellungen), in der installierten App hinter der
 * Elternsperre. Das Wörterbuch ist bewusst KEINE Kachel — dort kann man Wörter löschen.
 */
import { el, fehlerHinweis } from './dom';
import { erzeugeSperrHinweis, mitElternsperre, sperreAktiv } from './elternsperre';
import { mitHalten } from './halten';
import { icon } from './ui/icons';
import { stummHinweisEinmal } from '../audio/stummhinweis';
import { REGAL_MAX, type Dienste, type Modus, type ModusId, type RegalKachel } from './vertrag';

type Navigiere = (ziel: ModusId | 'start', param?: string) => void;

/** Elternbereich: leise Knöpfe im Fuß. */
const ELTERN: readonly ModusId[] = ['woerterbuch', 'einstellungen'];
/** Halten öffnet eine Kachel direkt. */
export const KACHEL_HALTEN_MS = 600;

/** Kacheln eines Modus; ohne `kacheln()` genau eine mit Titel und Icon. */
async function kachelnVon(m: Modus, dienste: Dienste): Promise<RegalKachel[]> {
  return m.kacheln ? m.kacheln(dienste) : [{ titel: m.titel }];
}

/** Die Kacheln des Regals in Regal-Reihenfolge, höchstens REGAL_MAX. */
export async function regalKacheln(dienste: Dienste, modi: readonly Modus[]): Promise<{ modus: Modus; kachel: RegalKachel }[]> {
  const nachId = new Map(modi.map((m) => [m.id, m]));
  const gewaehlt = dienste.einstellungen
    .lese()
    .regal.map((id) => nachId.get(id))
    .filter((m): m is Modus => m !== undefined && !m.fuerEltern);
  const je = await Promise.all(gewaehlt.map(async (modus) => (await kachelnVon(modus, dienste)).map((kachel) => ({ modus, kachel }))));
  return je.flat().slice(0, REGAL_MAX);
}

export function zeigeStart(wurzel: HTMLElement, dienste: Dienste, modi: readonly Modus[], navigiere: Navigiere): void {
  const nachId = new Map(modi.map((m) => [m.id, m]));
  const regal = el('nav', { klasse: 'start__arbeiten regal', testid: 'regal', attr: { 'aria-label': 'Regal', 'aria-busy': 'true' } });
  const meldung = el('div', { klasse: 'start__meldung', attr: { 'aria-live': 'polite' } });

  const fuss = el('footer', { klasse: 'start__fuss', attr: { 'aria-label': 'Für Eltern' } });
  const gesperrt = sperreAktiv(dienste.einstellungen);
  const sperrHinweis = erzeugeSperrHinweis();
  for (const id of ELTERN) {
    const m = nachId.get(id);
    if (!m) continue;
    const knopf = el(
      'button',
      {
        klasse: 'knopf knopf--leise',
        testid: id === 'einstellungen' ? 'einstellungen' : `modus-${id}`,
        beiKlick: gesperrt ? undefined : () => navigiere(id),
      },
      icon(m.icon, { groesse: 24 }),
      el('span', { text: m.titel }),
    );
    // Installierte App: Elternbereich nur nach langem Drücken (siehe kern/elternsperre.ts).
    if (gesperrt) mitElternsperre(knopf, sperrHinweis, () => navigiere(id));
    fuss.append(knopf);
  }
  fuss.append(sperrHinweis);

  const seite = el(
    'div',
    { klasse: 'start', testid: 'start' },
    el(
      'header',
      { klasse: 'start__kopf' },
      el('h1', { klasse: 'start__titel' }, el('span', { klasse: 'vokal', text: 'a' }), el('span', { klasse: 'konsonant', text: 'b' }), el('span', { klasse: 'konsonant', text: 'c' }), ' Werkstatt'),
    ),
    regal,
    meldung,
    fuss,
  );
  // B14: Eltern sehen auf iPhone/iPad beim ersten Start einmal den bildlichen Stummschalter-Hinweis.
  // Nur dort gibt es den Schalter; auf anderen Geräten steht der Hinweis in den Einstellungen.
  if (hatStummschalter()) stummHinweisEinmal(fuss);
  wurzel.append(seite);

  regalKacheln(dienste, modi).then(
    (liste) => {
      let bereit: HTMLElement | undefined;
      for (const { modus, kachel } of liste) {
        const oeffne = (): void => navigiere(modus.id, kachel.param);
        const bild = el('span', { klasse: kachel.bildUrl ? 'kachel__bild' : 'kachel__icon' });
        if (kachel.bildUrl) bild.append(el('img', { attr: { src: kachel.bildUrl, alt: '', decoding: 'async' } }));
        else bild.append(icon(modus.icon, { groesse: 44, strich: 1.6 }));
        const k = el(
          'button',
          { klasse: `kachel kachel--${modus.id}`, testid: `modus-${modus.id}`, attr: { ...(kachel.daten ?? {}), 'aria-label': kachel.titel } },
          bild,
          el(
            'span',
            { klasse: 'kachel__text' },
            el('span', { klasse: 'kachel__titel', text: kachel.titel }),
            kachel.untertitel ? el('span', { klasse: 'kachel__untertitel', text: kachel.untertitel }) : null,
          ),
        );
        mitHalten(k, {
          ms: KACHEL_HALTEN_MS,
          beiHalten: oeffne,
          beiKurz: () => {
            if (bereit === k) {
              oeffne();
              return;
            }
            if (bereit) delete bereit.dataset.bereit;
            bereit = k;
            k.dataset.bereit = 'ja';
            dienste.audio.fest(`kachel.${modus.id}`).catch((f: unknown) => meldung.replaceChildren(fehlerHinweis(f)));
          },
        });
        regal.append(k);
      }
      regal.setAttribute('aria-busy', 'false');
    },
    (f: unknown) => {
      regal.setAttribute('aria-busy', 'false');
      meldung.replaceChildren(fehlerHinweis(f));
    },
  );
}

/** iPhone/iPad (auch iPadOS, das sich als Mac ausgibt) — Geräte mit Stummschalter bzw. Stummmodus. */
function hatStummschalter(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
