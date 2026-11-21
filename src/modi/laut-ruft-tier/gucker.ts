/**
 * Anlaut-Gucker (F2 „Laut ruft Tier“) — wiederverwendbar im Freien Schreiben und im kleinen Kasten.
 *
 * Tippt das Kind einen Buchstaben, klingt SOFORT der Laut (macht der Aufrufer). Erst wenn er
 * verklungen ist (spätestens nach LAUT_FRIST_MS, falls das Audio nicht startet oder hängt), wackelt am Blattrand die Decke, und EIN Tier, dessen Anlaut genau dieser Buchstabe
 * ist, lugt als kleines Medaillon hervor und sagt „{laut} … {tier}!“ (`audio.lautRuf`, sonst sein
 * Name). Passt kein Tier, kommt nichts. Dieselbe Taste noch einmal: das NÄCHSTE Tier mit diesem Laut,
 * der Reihe nach (fest, kein Zufall). Antippen: `beiBesuch` (das Tier kommt groß heraus). Ohne
 * Antippen verschwindet es nach ≈ 6 s still. Ein neuer Tipp bricht den Ruf sofort ab.
 *
 * Testvertrag: EIN Element `anlaut-gucker` (data-tier, data-laut, data-offen="ja|nein"),
 * darin der Knopf `anlaut-gucker-tier`. Einstellung `lautRuftTier` wird bei jedem Tipp gelesen.
 * Einbau: `const g = erzeugeGucker({ ctx, melde, beiBesuch })`, `g.el` an den Blattrand hängen
 * (Elternelement mit `position: relative`), nach jedem Buchstaben `g.rufe(b, lautPromise)`,
 * in einer Wortarbeit NICHT rufen (würde den Hinweis verraten), beim Aufräumen `g.zerstoere()`.
 */
import { el } from '../../kern/dom';
import { tierTon } from '../../kern/tierton';
import type { AnlautTreffer, Ausgang, Buchstabe, Kontext } from '../../kern/vertrag';
import { tiereMitAnlaut } from '../../paket/anlaut';
import { bewegungVon } from '../../paket/bewegung';
import { bewege, erzeugeMedaillon, sprichTierName, tierBezeichnung } from '../tiere/freude';
import { schreibwort } from '../../kern/alphabet';
import './gucker.css';

/** So lange bleibt das Tier ohne Antippen sichtbar. */
export const GUCKER_MS = 6000;
/**
 * Spätestens so lange wartet der Gucker auf das Ende des Tastenlauts. Startet das Audio nicht oder
 * hängt es (stumm geschaltet, gesperrter Autoplay, langsame Live-Stimme), kommt das Tier trotzdem —
 * Fortschritt hängt nie allein an einem Audio-Ende.
 */
export const LAUT_FRIST_MS = 1500;

/**
 * Löst mit dem Ergebnis von `p` auf — oder nach `ms` mit 'fertig', falls `p` bis dahin nicht fertig ist.
 * Ein Fehler von `p` zählt wie 'fertig' (gemeldet wird er beim Aufrufer von `spiele`).
 */
export function mitFrist<T>(p: Promise<T>, ms: number): Promise<T | 'fertig'> {
  return new Promise((ok) => {
    const t = window.setTimeout(() => ok('fertig'), ms);
    p.then(
      (a) => {
        window.clearTimeout(t);
        ok(a);
      },
      () => {
        window.clearTimeout(t);
        ok('fertig');
      },
    );
  });
}

export interface GuckerOptionen {
  ctx: Pick<Kontext, 'audio' | 'pakete' | 'einstellungen' | 'notizen'>;
  melde(f: unknown): void;
  /** Das Kind tippt das Medaillon an: das Tier soll groß herauskommen (und seinen „kann“-Satz sagen). */
  beiBesuch?(treffer: AnlautTreffer): void;
}

export interface Gucker {
  el: HTMLElement;
  /**
   * Nach dem Tipp auf `laut`: `nachLaut` löst auf, wenn der Tastenlaut verklungen ist. Das Ergebnis
   * löst auf, wenn der Ruf vorbei ist (bzw. sofort, wenn kein Tier kommt) — nie mit Fehler.
   */
  rufe(laut: Buchstabe, nachLaut: Promise<Ausgang | undefined>): Promise<void>;
  /** Schließt sofort (z. B. wenn das Kind weitertippt oder ein Tier-Besuch kommt). */
  schliesse(): void;
  zerstoere(): void;
}

export function erzeugeGucker(o: GuckerOptionen): Gucker {
  const { ctx } = o;
  let anlaute: Map<Buchstabe, AnlautTreffer[]> | undefined;
  let laden: Promise<Map<Buchstabe, AnlautTreffer[]>> | undefined;
  const naechster = new Map<Buchstabe, number>();
  let nr = 0;
  let timer: number | undefined;
  let lebt = true;

  const wurzel = el('div', { klasse: 'gucker', testid: 'anlaut-gucker', attr: { 'data-offen': 'nein', 'aria-live': 'polite' } });

  function tiere(): Promise<Map<Buchstabe, AnlautTreffer[]>> {
    if (anlaute) return Promise.resolve(anlaute);
    laden ??= ctx.pakete.liste().then((p) => {
      anlaute = tiereMitAnlaut(p);
      laden = undefined;
      return anlaute;
    });
    return laden;
  }
  // Nach Import/Löschen neu einlesen; die Reihe je Laut beginnt dann von vorn.
  const abmelden = ctx.pakete.abonniere(() => {
    anlaute = undefined;
    naechster.clear();
  });

  function schliesse(): void {
    nr++;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
    wurzel.dataset.offen = 'nein';
  }

  async function zeige(treffer: AnlautTreffer, meinNr: number): Promise<void> {
    const url = await ctx.pakete.bildUrl(treffer.paket.id, treffer.tier.bild);
    if (!lebt || meinNr !== nr) return;
    const bewegung = bewegungVon(treffer.tier);
    const medaillon = erzeugeMedaillon(url, tierBezeichnung(treffer), { klasse: 'gucker__medaillon', bewegung });
    const knopf = el(
      'button',
      {
        klasse: 'gucker__tier',
        testid: 'anlaut-gucker-tier',
        attr: { 'aria-label': `${tierBezeichnung(treffer)} – antippen` },
        beiKlick: () => {
          if (meinNr !== nr) return;
          schliesse();
          o.beiBesuch?.(treffer);
        },
      },
      medaillon,
    );
    wurzel.dataset.tier = treffer.tier.id;
    wurzel.dataset.laut = treffer.laut;
    wurzel.replaceChildren(el('span', { klasse: 'gucker__decke', attr: { 'aria-hidden': 'true' } }), knopf);
    wurzel.dataset.offen = 'ja';
    bewege(medaillon, bewegung);
    ctx.notizen.merke({ art: 'tier', wert: treffer.tier.name });

    // Decke raschelt (falls vertont) → „{laut} … {tier}!“ (sonst der Name). Läuft immer nur eine Tonquelle.
    const ruf = async (): Promise<Ausgang> =>
      (await tierTon(ctx, treffer, 'lautRuf')) ?? sprichTierName(ctx, treffer, schreibwort(treffer.tier.name));
    const schritte = (await ctx.audio.hatFest('geraeusch.decke-wackelt')) ? [() => ctx.audio.fest('geraeusch.decke-wackelt'), ruf] : [ruf];
    if (!lebt || meinNr !== nr) return;
    timer = window.setTimeout(() => {
      if (meinNr === nr) schliesse();
    }, GUCKER_MS);
    await ctx.audio.kette(schritte, 150);
  }

  return {
    el: wurzel,
    rufe(laut, nachLaut) {
      schliesse();
      const meinNr = nr;
      if (!ctx.einstellungen.lese().lautRuftTier) return nachLaut.then(() => undefined);
      return Promise.all([tiere(), mitFrist(nachLaut, LAUT_FRIST_MS)])
        .then(([m, a]) => {
          // abgebrochen: das Kind tippt schon weiter — der neue Laut hat Vorrang.
          if (!lebt || meinNr !== nr || a === 'abgebrochen') return;
          const liste = m.get(laut);
          if (!liste?.length) return; // kein Tier mit diesem Anlaut: es kommt einfach nichts
          const i = naechster.get(laut) ?? 0;
          naechster.set(laut, (i + 1) % liste.length);
          return zeige(liste[i % liste.length] as AnlautTreffer, meinNr);
        })
        .catch(o.melde);
    },
    schliesse,
    zerstoere() {
      lebt = false;
      schliesse();
      abmelden();
      wurzel.remove();
    },
  };
}
