/**
 * F7 Meine Leute (Bau „spiele“). Spezifikation: docs/konzept-spass-und-lernen.md (F7).
 *
 * Wiese mit den Fotos, die Papa im Elternbereich angelegt hat (`elternAbschnitt`, siehe
 * verwaltung.ts). Wenige Fotos werden groß und mittig gezeigt (ein einzelnes füllt die Wiese und
 * lädt mit einem ruhig atmenden Leuchtring zum Antippen ein) — nie ein kleines Bild auf leerer Seite.
 * Erster Tipp: Papas Aufnahme (sonst das Wort über den Audio-Dienst: vorab vertont oder live).
 * Zweiter Tipp: dieselbe Stufen-Arbeit wie der Tier-Modus (src/modi/tiere/stufenarbeit.ts) auf der
 * eingestellten Stufe (`tierStufe`, Stufe 1 = nur der Anlaut, 2 Tasten). Danach Nachklingen, die
 * Elternaufnahme, dann `lob.leute`.
 *
 * Datenschutz: Wörter, Fotos und Aufnahmen liegen nur in IndexedDB (LeuteDienst). Hier wird
 * nichts davon in localStorage oder in die Sitzungsnotizen geschrieben.
 *
 * testids: leute-wiese (data-anzahl), leute-<id> (mit img), leute-bild, leute-weiter,
 * zielwort/slot/taste wie die Wortarbeit.
 */
import { el } from '../../kern/dom';
import type { Ausgang, Kontext, Modus, Person } from '../../kern/vertrag';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeStufenArbeit, type StufenArbeit } from '../tiere/stufenarbeit';
import { hoechstens, huepfe, leerHinweis, sicher, weiterKnopf, wortAufgabe } from '../geschichten/gemeinsam';
import { leuteVerwaltung } from './verwaltung';
import './leute.css';

let sitzung: Sitzung | undefined;

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;
  const meldung = erzeugeMeldung();
  const melde = meldung.melde;

  const leute = await ctx.leute.liste();
  if (!s.lebt) return;
  if (leute.length === 0) {
    flaeche.append(leerHinweis(ctx, 'Hier ist noch niemand. Im Elternbereich unter „Meine Leute“ Fotos und Wörter anlegen.'));
    return;
  }
  const fotos = await Promise.all(leute.map((p) => ctx.leute.fotoUrl(p.id)));
  if (!s.lebt) return;

  flaeche.classList.add('flaeche--leute');
  s.nachher(() => flaeche.classList.remove('flaeche--leute'));
  const platz = el('div', { klasse: 'leute' });
  flaeche.append(platz, meldung.el);
  s.nachher(() => ctx.audio.stopp());

  let arbeit: StufenArbeit | undefined;
  s.nachher(() => arbeit?.zerstoere());

  /** Papas Aufnahme, sonst das Wort (vorab vertont oder live, 6c). */
  async function sprich(p: Person): Promise<Ausgang> {
    const url = p.hatAufnahme ? await ctx.leute.aufnahmeUrl(p.id) : undefined;
    return url ? ctx.audio.datei(url) : ctx.audio.wort(p.wort);
  }

  function fotoBild(i: number, p: Person, klasse: string): HTMLElement {
    return el('img', { klasse, attr: { src: fotos[i] ?? '', alt: p.wort, draggable: 'false' } });
  }

  function zeigeWiese(): void {
    arbeit?.zerstoere();
    arbeit = undefined;
    let gewaehlt: string | undefined;
    const knoepfe = leute.map((p, i) => {
      const knopf = el(
        'button',
        {
          klasse: 'leute__person',
          testid: `leute-${p.id}`,
          attr: { 'aria-pressed': 'false', 'aria-label': p.wort },
          beiKlick: () => {
            if (gewaehlt === p.id) {
              zeigeArbeit(i, p);
              return;
            }
            gewaehlt = p.id;
            for (const k of knoepfe) k.setAttribute('aria-pressed', String(k === knopf));
            wiese.dataset.gewaehlt = 'ja';
            huepfe(knopf);
            void spiele(sprich(p), melde);
          },
        },
        fotoBild(i, p, 'leute__foto'),
      );
      return knopf;
    });
    // Anzahl steuert die Größe: 1 Foto füllt die Wiese, 2–3 groß, ab 4 Medaillon-Größe.
    const anzahl = leute.length <= 3 ? String(leute.length) : 'viele';
    const wiese = el('div', { klasse: 'spiel-wiese leute__wiese', testid: 'leute-wiese', attr: { 'data-anzahl': anzahl } }, ...knoepfe);
    platz.replaceChildren(wiese);
  }

  function zeigeArbeit(i: number, p: Person): void {
    ctx.audio.stopp();
    arbeit?.zerstoere();
    const e = ctx.einstellungen.lese();
    const foto = el(
      'button',
      { klasse: 'leute__gross', testid: 'leute-bild', attr: { 'aria-label': `${p.wort} – hören` }, beiKlick: () => void spiele(sprich(p), melde) },
      fotoBild(i, p, 'leute__foto'),
    );
    const ende = el('div', { klasse: 'leute__ende' });
    let neu: StufenArbeit;
    try {
      const aufgabe = wortAufgabe(p.wort, e.tierStufe, e.kindAnfang ? [e.kindAnfang] : []);
      neu = erzeugeStufenArbeit({
        ctx,
        wort: p.wort,
        offen: aufgabe.offen,
        tasten: aufgabe.tasten,
        hilfeNach: e.hilfeNach,
        sprichWort: () => sprich(p),
        melde,
        beiGeschafft(klang) {
          huepfe(foto);
          ende.replaceChildren(weiterKnopf('leute-weiter', 'Zurück zu den Fotos', () => {
            ctx.audio.stopp();
            zeigeWiese();
          }, 'leute'));
          void hoechstens(s, klang, 8000).then(() => {
            if (s.lebt) void ctx.audio.kette([sicher(() => ctx.audio.fest('lob.leute'), melde)]);
          });
        },
      });
    } catch (f) {
      melde(f);
      return;
    }
    arbeit = neu;
    platz.replaceChildren(el('div', { klasse: 'leute__arbeit' }, foto, neu.el), ende);
    void spiele(sprich(p), melde);
  }

  zeigeWiese();
}

export const modus: Modus = {
  id: 'leute',
  titel: 'Meine Leute',
  icon: 'leute',
  begleitkarte:
    'Die ersten Wörter sind die wichtigsten Menschen. Sprecht das Wort langsam und deutlich auf, so wie ihr es dem Kind vorsagt. Fotos, Wörter und Aufnahmen bleiben nur auf diesem Gerät.',
  elternAbschnitt: leuteVerwaltung,
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
