/**
 * Tier-Modus (Bau „tiere“, F1/B2/B4/B9/B10/B11/B15/B17). Route: navigiere('tiere', paketId).
 *
 * Ablauf einer Runde:
 * 1. Tier-Wiese: 3 Medaillons (zwei leichte, eins lange nicht dagewesen), „andere Tiere“, „noch mal“.
 * 2. Schreiben auf der eingestellten Stufe (`tierStufe`, Standard 1, die App steigert nie selbst):
 *    1 nur Anlaut (2 Tasten) · 2 Anlaut + Endlaut (3 Tasten) · 3 ganzes Wort mit kleiner Auswahl ·
 *    4 volles Alphabet (heutiges Verhalten). Hilfe nach `hilfeNach` Fehlversuchen.
 * 3. Nachklingen, dann freut sich das Tier in seiner Bewegung. KEIN Auto-Weiter: das Tier bleibt
 *    sitzen, jeder Tipp darauf bringt Neues (Name, „kann“, Bewegung + Freude), an Stelle der Tasten pulsiert
 *    langsam der Weiter-Knopf.
 * 4. Nach `rundenBisGuteNacht` gelungenen Tieren kommt statt der Wiese die Gute Nacht.
 *
 * Gespeichert wird je Paket nur, wann ein Tier zuletzt geschrieben wurde (für „lange nicht“).
 */
import { createStore, get, set } from 'idb-keyval';
import { buchstabenVon, schreibwort } from '../../kern/alphabet';
import { el } from '../../kern/dom';
import { icon } from '../../kern/ui/icons';
import { tierTon } from '../../kern/tierton';
import {
  ANLAUT_LAUTE,
  type Ausgang,
  type Buchstabe,
  type Dienste,
  type KettenSchritt,
  type Kontext,
  type Modus,
  type RegalKachel,
  type TierPaket,
  type TierStufe,
  type TierTreffer,
} from '../../kern/vertrag';
import { anlautBuchstabe } from '../../paket/anlaut';
import { bewegungVon } from '../../paket/bewegung';
import { Sitzung, erzeugeMeldung, spiele } from '../nachfuellen/sitzung';
import { erzeugeWortarbeit } from '../nachfuellen/wortarbeit';
import { stufenAufgabe, tiereFuerStufe, wieseFuer } from './auswahl';
import {
  erzeugeFreude,
  erzeugeMedaillon,
  SPRECH_PAUSE_MS,
  sprichFreude,
  sprichTierName,
  tierBezeichnung,
  tippAufsTier,
} from './freude';
import { erzeugeGuteNacht } from './gute-nacht';
import { erzeugeStufenArbeit } from './stufenarbeit';
import { erzeugeWiese } from './wiese';
import './tiere.css';

/**
 * Obergrenze bis zur Freude, falls das Nachklingen (Sprachausgabe) hängt. Wächst mit dem Wort:
 * Das Nachklingen spielt Tastenlaut, jeden Buchstaben (Dauerlaute ≈ 1,2 s) und dann das Wort —
 * eine feste Grenze schnitte bei langen Namen die Freude stumm ab.
 */
export function freudeSpaetestensMs(wort: string): number {
  return 3000 + 1300 * Array.from(wort).length;
}

const fortschritt = createStore('abc-werkstatt-fortschritt', 'kv');
const zuletztSchluessel = (paketId: string): string => `tiere-zuletzt:${paketId}`;
type Zuletzt = Record<string, number>;

/** Wann welches Tier zuletzt geschrieben wurde (ms), leer beim ersten Mal. */
async function ladeZuletzt(paketId: string): Promise<Zuletzt> {
  const roh = await get<unknown>(zuletztSchluessel(paketId), fortschritt);
  if (roh === undefined) return {};
  if (typeof roh !== 'object' || roh === null || Array.isArray(roh) || Object.values(roh).some((v) => typeof v !== 'number')) {
    throw new Error('Gespeicherter Tier-Fortschritt ist beschädigt.');
  }
  return roh as Zuletzt;
}

let sitzung: Sitzung | undefined;

function zeigeHinweis(flaeche: HTMLElement, ctx: Kontext, text: string): void {
  flaeche.append(
    el(
      'div',
      { klasse: 'hinweis stapel mitte' },
      el('p', { text }),
      el('button', { klasse: 'knopf', beiKlick: () => ctx.navigiere('start') }, icon('zurueck'), el('span', { text: 'Zum Start' })),
    ),
  );
}

/** Bilder der nächsten Tiere dekodieren und Audio-URLs anlegen, solange das aktuelle Tier sich freut (B15). */
function vorladen(ctx: Kontext, tiere: readonly TierTreffer[]): void {
  for (const t of tiere) {
    ctx.pakete
      .bildUrl(t.paket.id, t.tier.bild)
      .then((url) => {
        const bild = new Image();
        bild.src = url;
        return bild.decode();
      })
      .catch((f: unknown) => console.error('Vorladen fehlgeschlagen', f));
    const a = t.tier.audio;
    for (const pfad of [a?.name, ...(a?.freude ?? []), ...(a?.anlautName ?? [])]) {
      if (pfad) ctx.pakete.audioUrl(t.paket.id, pfad).catch((f: unknown) => console.error('Vorladen fehlgeschlagen', f));
    }
  }
}

async function mount(flaeche: HTMLElement, ctx: Kontext): Promise<void> {
  sitzung?.beende();
  const s = new Sitzung();
  sitzung = s;

  const id = ctx.param;
  if (!id) {
    zeigeHinweis(flaeche, ctx, 'Hier fehlt ein Tier-Paket. Bitte auf dem Start ein Paket wählen.');
    return;
  }
  const geladen = await ctx.pakete.hole(id);
  if (!s.lebt) return;
  if (!geladen) {
    zeigeHinweis(flaeche, ctx, 'Dieses Tier-Paket ist nicht mehr auf dem Gerät.');
    return;
  }
  const paket: TierPaket = geladen;
  ctx.setzeTitel(paket.titel);

  const meldung = erzeugeMeldung();
  const buehne = el('div', { klasse: 'tiere__buehne' });
  flaeche.classList.add('flaeche--tiere');
  s.nachher(() => flaeche.classList.remove('flaeche--tiere'));
  flaeche.append(buehne, meldung.el);

  const zuletzt = await ladeZuletzt(paket.id);
  if (!s.lebt) return;

  /** Aufräumen des gerade gezeigten Bildschirms (Wiese, Arbeit, Gute Nacht). */
  let aufraeumen: (() => void) | undefined;
  s.nachher(() => aufraeumen?.());
  /** Zählt Bildschirme; asynchrone Reste eines alten Bildschirms prüfen damit, ob sie noch dran sind. */
  let bild = 0;
  let blatt = 0;
  /** Gelungene Runden seit Start bzw. letztem Aufwecken (kein sichtbarer Zähler). */
  let runden = 0;
  /** Tiere dieser Sitzung (für die Gute Nacht). */
  const sitzungsTiere: TierTreffer[] = [];
  let letztes: TierTreffer | undefined;

  function neuerBildschirm(inhalt: HTMLElement, weg: () => void): number {
    aufraeumen?.();
    aufraeumen = weg;
    buehne.replaceChildren(inhalt);
    return ++bild;
  }

  const einstellung = (): { stufe: TierStufe; hilfeNach: number; guteNacht: number } => {
    const e = ctx.einstellungen.lese();
    return { stufe: e.tierStufe, hilfeNach: e.hilfeNach, guteNacht: e.rundenBisGuteNacht };
  };

  /** Buchstaben, die das Kind schon kennt (Anfangsbuchstabe, Laute der letzten Sitzung) — als Ablenker bevorzugt. */
  function bekannteBuchstaben(): Buchstabe[] {
    const e = ctx.einstellungen.lese();
    const aus: Buchstabe[] = e.kindAnfang ? [e.kindAnfang] : [];
    for (const n of ctx.notizen.heuteDran()) if (n.art === 'laut') aus.push(...buchstabenVon(n.wert).slice(0, 1));
    return aus;
  }

  function naechsteWiese(): TierTreffer[] {
    return wieseFuer(tiereFuerStufe(paket, einstellung().stufe), zuletzt, blatt).map((tier) => ({ paket, tier }));
  }

  // --- 1. Wiese -------------------------------------------------------------
  async function zeigeWiese(): Promise<void> {
    const tiere = naechsteWiese();
    if (tiere.length === 0) {
      neuerBildschirm(
        el('p', { klasse: 'hinweis', text: `Auf Stufe ${einstellung().stufe} passt kein Tier aus diesem Paket (es fehlt ein Anlaut). Im Elternbereich eine höhere Stufe wählen.` }),
        () => undefined,
      );
      return;
    }
    const meinBild = bild;
    const wiese = await erzeugeWiese({
      ctx,
      tiere,
      letztes,
      melde: meldung.melde,
      beiWahl: (t) => starte(t),
      beiAndere: () => {
        blatt++;
        zeigeWiese().catch(meldung.melde);
      },
    });
    if (!s.lebt || meinBild !== bild) {
      wiese.zerstoere();
      return;
    }
    neuerBildschirm(wiese.el, () => wiese.zerstoere());
  }

  // --- 2. Schreiben ---------------------------------------------------------
  function starte(t: TierTreffer): void {
    starteRunde(t).catch(meldung.melde);
  }

  async function starteRunde(treffer: TierTreffer): Promise<void> {
    const { tier } = treffer;
    const { stufe, hilfeNach } = einstellung();
    const wort = schreibwort(tier.name);
    const name = tierBezeichnung(treffer);
    const wiederholt = letztes !== undefined && letztes.paket.id === paket.id && letztes.tier.id === tier.id;
    letztes = treffer;
    ctx.audio.stopp();
    const bildUrl = await ctx.pakete.bildUrl(paket.id, tier.bild);
    if (!s.lebt) return;

    const bildKnopf = el(
      'button',
      { klasse: 'tiere__bild-knopf', attr: { 'aria-label': `${name} – Namen hören` }, beiKlick: () => void spiele(sprichTierName(ctx, treffer, wort), meldung.melde) },
      erzeugeMedaillon(bildUrl, name, { klasse: 'tier-bild erscheint', testid: 'tier-bild', bewegung: bewegungVon(tier) }),
    );
    const tierPlatz = el('div', { klasse: 'tiere__tier' }, bildKnopf);
    const arbeitPlatz = el('div', { klasse: 'tiere__arbeit' });
    const runde = el('div', { klasse: 'tiere__runde', testid: 'tier-stufe', attr: { 'data-stufe': stufe } }, tierPlatz, arbeitPlatz);

    let fertigeArbeit: { zerstoere(): void } | undefined;
    const meinBild = neuerBildschirm(runde, () => fertigeArbeit?.zerstoere());
    const aktuell = (): boolean => s.lebt && meinBild === bild;

    const geschafft = (nachklang: Promise<Ausgang | undefined>, ausStufen: boolean): void => {
      runden++;
      sitzungsTiere.push(treffer);
      zuletzt[tier.id] = Date.now();
      set(zuletztSchluessel(paket.id), { ...zuletzt }, fortschritt).catch(meldung.melde);
      ctx.notizen.merke({ art: 'tier', wert: tier.name });
      const laut = anlautBuchstabe(tier);
      if (laut) ctx.notizen.merke({ art: 'laut', wert: laut });
      blatt++;
      const naechste = naechsteWiese();
      vorladen(ctx, naechste);
      // Die Freude kommt nach dem Nachklingen — spätestens nach FREUDE_SPAETESTENS_MS, falls eine
      // Sprachausgabe hängt (das Kind soll nie vor einem stummen, starren Bild sitzen).
      let gezeigt = false;
      const freude = (a: Ausgang | undefined): void => {
        if (gezeigt || !aktuell()) return;
        gezeigt = true;
        zeigeFreude(treffer, bildUrl, tierPlatz, arbeitPlatz, a, ausStufen, wiederholt);
      };
      void nachklang.then(freude);
      s.warte(freudeSpaetestensMs(wort), () => freude('abgebrochen'));
    };

    if (stufe === 4) {
      const arbeit = erzeugeWortarbeit({
        ctx,
        wort,
        vorlage: ctx.einstellungen.lese().tierModusMitVorlage,
        vollesAlphabet: true,
        artikel: tier.artikel,
        melde: meldung.melde,
        beiGeschafft: (letzterLaut) => geschafft(letzterLaut, false),
      });
      fertigeArbeit = arbeit;
      arbeitPlatz.append(arbeit.el);
      void spiele(sprichTierName(ctx, treffer, wort), meldung.melde);
      return;
    }

    const aufgabe = stufenAufgabe(tier, stufe, bekannteBuchstaben());
    const arbeit = erzeugeStufenArbeit({
      ctx,
      wort,
      offen: aufgabe.offen,
      tasten: aufgabe.tasten,
      artikel: tier.artikel,
      hilfeNach,
      sprichWort: () => sprichTierName(ctx, treffer, wort),
      melde: meldung.melde,
      beiGeschafft: (nachklang) => geschafft(nachklang, true),
    });
    fertigeArbeit = arbeit;
    arbeitPlatz.append(arbeit.el);

    // Einladung: Name (gedehnter Anlaut, wenn vertont) → Pause → „Hör mal: mmm …“ (Stufe 1–2).
    const laut = anlautBuchstabe(tier);
    const schritte: KettenSchritt[] = [
      async (): Promise<Ausgang> => (await tierTon(ctx, treffer, 'anlautName')) ?? sprichTierName(ctx, treffer, wort),
    ];
    // `einladung.<laut>` gibt es nur für ANLAUT_LAUTE (ohne c, q, x, y, ß).
    if (stufe <= 2 && laut && ANLAUT_LAUTE.includes(laut)) schritte.push(() => ctx.audio.fest('einladung.{laut}', { laut }));
    ctx.audio.kette(schritte, SPRECH_PAUSE_MS).catch(meldung.melde);
  }

  // --- 3. Freude, kein Auto-Weiter -------------------------------------------
  function zeigeFreude(
    treffer: TierTreffer,
    bildUrl: string,
    tierPlatz: HTMLElement,
    arbeitPlatz: HTMLElement,
    nachklang: Ausgang | undefined,
    ausStufen: boolean,
    wiederholt: boolean,
  ): void {
    const wort = schreibwort(treffer.tier.name);
    const name = tierBezeichnung(treffer);
    const meinBild = bild;
    const aktuell = (): boolean => s.lebt && meinBild === bild;
    const freude = erzeugeFreude({ bildUrl, alt: name, tier: treffer.tier });
    let tipps = 0;
    tierPlatz.classList.add('tiere__tier--freude');
    tierPlatz.replaceChildren(
      el(
        'button',
        {
          klasse: 'tiere__bild-knopf',
          attr: { 'aria-label': `${name} – antippen` },
          beiKlick: () => {
            if (aktuell()) tippAufsTier(ctx, treffer, wort, tipps++, freude, meldung.melde);
          },
        },
        freude,
      ),
    );
    const weiter = el(
      'button',
      {
        klasse: 'knopf knopf--gross tiere__weiter',
        testid: 'tier-weiter',
        attr: { 'aria-label': 'Weiter' },
        beiKlick: () => {
          if (!aktuell()) return;
          ctx.audio.stopp();
          if (runden >= einstellung().guteNacht) zeigeGuteNacht();
          else zeigeWiese().catch(meldung.melde);
        },
      },
      icon('tiere', { groesse: 44, strich: 1.8 }),
      icon('weiter', { groesse: 32, strich: 2.4 }),
    );
    // Der Weiter-Knopf tritt an die Stelle der Tasten: nichts rutscht, keine verblassten Tasten
    // laden zum Weitertippen ins Leere ein, und der Knopf liegt dort, wo der Finger schon ist.
    const weiterPlatz = el('div', { klasse: 'tiere__weiter-platz' }, weiter);
    const tasten = arbeitPlatz.querySelector<HTMLElement>('.alphabet');
    if (tasten) {
      weiterPlatz.style.minHeight = `${tasten.offsetHeight}px`;
      tasten.hidden = true;
      tasten.after(weiterPlatz);
    } else arbeitPlatz.append(weiterPlatz);

    // Sprechen: abgebrochen = das Kind hat schon etwas Neues angetippt — nicht drüberreden.
    if (nachklang === 'abgebrochen') return;
    const anfang: KettenSchritt[] | undefined =
      ausStufen && !wiederholt
        ? [async (): Promise<Ausgang> => (await tierTon(ctx, treffer, 'geschrieben')) ?? ctx.audio.fest('lob.allgemein')]
        : undefined;
    void sprichFreude(ctx, treffer, wort, aktuell, meldung.melde, { wiederholt, anfang });
  }

  // --- 4. Gute Nacht ---------------------------------------------------------
  function zeigeGuteNacht(): void {
    const nacht = erzeugeGuteNacht({
      ctx,
      tiere: sitzungsTiere,
      melde: meldung.melde,
      beiWecken: () => {
        runden = 0;
        sitzungsTiere.length = 0;
        zeigeWiese().catch(meldung.melde);
      },
    });
    neuerBildschirm(nacht.el, () => nacht.zerstoere());
  }

  await zeigeWiese();
}

/**
 * Regal: eine Kachel je installiertem Paket (Titel, Untertitel, Cover). Ohne Paket fehlt die Arbeit,
 * ebenso ein Paket ohne Tier für die eingestellte Stufe (B1: keine Kachel vor einem Elternhinweis).
 */
async function kacheln(dienste: Dienste): Promise<RegalKachel[]> {
  const stufe = dienste.einstellungen.lese().tierStufe;
  const pakete = (await dienste.pakete.liste()).filter((p) => tiereFuerStufe(p, stufe).length > 0);
  return Promise.all(
    pakete.map(async (p) => {
      const k: RegalKachel = { titel: p.titel, param: p.id, daten: { 'data-paket': p.id } };
      if (p.untertitel) k.untertitel = p.untertitel;
      if (p.cover) {
        try {
          k.bildUrl = await dienste.pakete.bildUrl(p.id, p.cover);
        } catch (f) {
          // Cover unlesbar: Kachel mit Tier-Icon statt gar keiner Kachel; Ursache im Log.
          console.error(f);
        }
      }
      return k;
    }),
  );
}

export const modus: Modus = {
  id: 'tiere',
  titel: 'Tiere',
  icon: 'tiere',
  kacheln,
  begleitkarte:
    'Lassen Sie Ihr Kind das Tier selbst wählen, auch zum zehnten Mal. Sprechen Sie den Anfangslaut gedehnt vor („mmm … Maus“), statt zu korrigieren. Die Stufe stellen nur Sie um — erst, wenn der Anfang an mehreren Tagen mühelos klappt.',
  mount,
  unmount() {
    sitzung?.beende();
    sitzung = undefined;
  },
};
