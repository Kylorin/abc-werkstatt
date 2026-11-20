/**
 * Nachfüllen (Bau „schreiben"): ein Wort aus dem Wörterbuch als Schattenvorlage,
 * das Kind legt die Buchstaben der Reihe nach hinein. Fertig → Wort wird ganz vorgelesen,
 * ruhige Hervorhebung, nach ~3 s kommt ein anderes Wort.
 */
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import type { Kontext, Modus } from '../../kern/vertrag';
import { Sitzung, erzeugeMeldung, spiele } from './sitzung';
import { erzeugeWortarbeit, type Wortarbeit } from './wortarbeit';

const PAUSE_NACH_GESCHAFFT_MS = 3000;

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
          el('p', { text: 'Im Wörterbuch ist noch kein Wort.' }),
          el(
            'button',
            { klasse: 'knopf', beiKlick: () => ctx.navigiere('woerterbuch') },
            icon('woerterbuch'),
            el('span', { text: 'Zum Wörterbuch' }),
          ),
        ),
      );
      return;
    }
    const neu = erzeugeWortarbeit({
      ctx,
      wort,
      vorlage: true,
      vollesAlphabet: false,
      melde: meldung.melde,
      beiGeschafft(letzterLaut) {
        void letzterLaut.then(() => {
          if (s.lebt && arbeit === neu) return spiele(ctx.audio.wort(wort), meldung.melde);
        });
        s.warte(PAUSE_NACH_GESCHAFFT_MS, () => {
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
