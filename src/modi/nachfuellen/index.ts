/**
 * Nachfüllen (Bau „schreiben“): ein Wort aus dem Wörterbuch als Schattenvorlage,
 * das Kind legt die Buchstaben der Reihe nach hinein. Fertig → Wort wird ganz vorgelesen,
 * ruhige Hervorhebung. Das nächste Wort kommt erst, wenn das Wort zu Ende gesprochen ist
 * (mindestens ~3 s Verweilen; die Obergrenze greift nur bei hängender Sprachausgabe).
 */
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Kontext, Modus } from '../../kern/vertrag';
import { Sitzung, erzeugeMeldung, spiele, warteAufSprache } from './sitzung';
import { erzeugeWortarbeit, type Wortarbeit } from './wortarbeit';

const PAUSE_NACH_GESCHAFFT_MS = 3000;
const HOECHSTENS_NACH_GESCHAFFT_MS = 8000;

let sitzung: Sitzung | undefined;

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;

  const meldung = erzeugeMeldung();
  const platz = el('div', { klasse: 'nachfuellen' });
  flaeche.append(platz, meldung.el);

  let arbeit: Wortarbeit | undefined;
  s.nachher(() => arbeit?.zerstoere());

  async function naechstesWort(ausser?: string): Promise<void> {
    const wort = await ctx.woerter.zufall(ausser);
    if (!s.lebt) return;
    arbeit?.zerstoere();
    arbeit = undefined;
    if (!wort) {
      platz.replaceChildren(
        el(
          'div',
          { klasse: 'hinweis stapel mitte', testid: 'woerterbuch-leer' },
          // Kein Weg ins Wörterbuch von hier: dort kann man Wörter löschen, und der Kind-Modus
          // umgeht sonst die Elternsperre (die hängt nur am Fuß der Startseite).
          el('p', { text: 'Im Wörterbuch ist noch kein Wort. Eltern legen Wörter auf der Startseite unten unter „Wörterbuch“ an.' }),
          el('button', { klasse: 'knopf', beiKlick: () => ctx.navigiere('start') }, icon('zurueck'), el('span', { text: 'Zum Start' })),
        ),
      );
      return;
    }
    const neu = erzeugeWortarbeit({
      ctx,
      wort,
      vorlage: true,
      vollesAlphabet: false,
      hoerZeichen: true,
      hilfeNach: ctx.einstellungen.lese().hilfeNach,
      melde: meldung.melde,
      beiGeschafft(letzterLaut) {
        const gesprochen = letzterLaut.then((a) => {
          // abgebrochen: das Kind hat schon etwas anderes angetippt — das nicht übertönen.
          if (a === 'abgebrochen' || !s.lebt || arbeit !== neu) return;
          return spiele(ctx.audio.wort(wort), meldung.melde);
        });
        void warteAufSprache(s, gesprochen, PAUSE_NACH_GESCHAFFT_MS, HOECHSTENS_NACH_GESCHAFFT_MS).then(() => {
          if (!s.lebt || arbeit !== neu) return;
          ctx.audio.stopp();
          naechstesWort(wort).catch(meldung.melde);
        });
      },
    });
    arbeit = neu;
    platz.replaceChildren(neu.el);
  }

  await naechstesWort();
}

export const modus: Modus = {
  id: 'nachfuellen',
  titel: 'Nachfüllen',
  icon: 'nachfuellen',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
