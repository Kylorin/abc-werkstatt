/**
 * Tierauswahl und Aufgaben je Stufe (F1, B4).
 *
 * - Stufe 1–2: nur Anlaut-Tiere (gültiger Einzel-Anlaut) mit lautgetreuem Schreibwort und
 *   lautreinem Anfang. Stufe 3: lautgetreue Wörter ohne schweren Anfang. Stufe 4: alle Tiere.
 * - Die Wiese zeigt 3 Medaillons: zwei aus der leichten Vorauswahl, eins, das das Kind lange
 *   nicht hatte. „Andere Tiere“ blättert weiter. Kein Tier ist gesperrt.
 */
import { buchstabenVon, schreibwort } from '../../kern/alphabet';
import { ANLAUT_LAUTE, type Buchstabe, type Tier, type TierPaket, type TierStufe } from '../../kern/vertrag';
import { anlautBuchstabe, kontrastiert, waehleAblenker } from '../../paket/anlaut';
import { lautreineAnlautTiere } from '../../paket/felder';
import { hatLautreinenAnfang, istLautgetreu, tiereNachSchwierigkeit } from '../../paket/woerter';

export const WIESE_GROESSE = 3;

/** Die Tiere, die auf dieser Stufe angeboten werden — vom leichtesten zum schwersten. */
export function tiereFuerStufe(paket: TierPaket, stufe: TierStufe): Tier[] {
  let tiere: Tier[];
  if (stufe <= 2) tiere = lautreineAnlautTiere(paket).map((t) => t.tier);
  else if (stufe === 3) tiere = paket.tiere.filter((t) => istLautgetreu(schreibwort(t.name)) && hatLautreinenAnfang(schreibwort(t.name)));
  else tiere = [...paket.tiere];
  return tiereNachSchwierigkeit(tiere);
}

/**
 * Drei Medaillons für die Wiese. `zuletzt` = Zeitpunkt, an dem das Kind ein Tier zuletzt
 * geschrieben hat; `blatt` zählt „andere Tiere“ hoch. Weniger als drei Tiere: alle.
 */
export function wieseFuer(tiere: readonly Tier[], zuletzt: Readonly<Record<string, number>>, blatt: number): Tier[] {
  if (tiere.length <= WIESE_GROESSE) return [...tiere];
  // Leichte Vorauswahl: die leichtere Hälfte (mindestens 2 Tiere), der Reihe nach durchblättert.
  const leicht = tiere.slice(0, Math.max(2, Math.ceil(tiere.length / 2)));
  const wahl: Tier[] = [];
  for (let i = 0; wahl.length < 2 && i < leicht.length; i++) {
    const t = leicht[(blatt * 2 + i) % leicht.length];
    if (t && !wahl.includes(t)) wahl.push(t);
  }
  // Dazu eins, das das Kind am längsten nicht hatte (nie geschrieben = am längsten her).
  const rest = tiere.filter((t) => !wahl.includes(t));
  const lange = [...rest].sort((a, b) => (zuletzt[a.id] ?? 0) - (zuletzt[b.id] ?? 0) || tiere.indexOf(a) - tiere.indexOf(b));
  const dritte = lange[blatt % Math.max(1, Math.min(lange.length, 3))] ?? lange[0];
  if (dritte) wahl.push(dritte);
  return wahl;
}

/** Was das Kind auf einer Stufe legt: offene Felder und die Tasten im Kasten. `undefined` = Stufe 4 (volles Alphabet). */
export interface StufenAufgabe {
  offen: number[];
  tasten: Buchstabe[];
}

/** Endet das Schreibwort auf einen Einzellaut? (nicht: ch, ck, ng, ei, eu, äu, au, ie, ai, pf, ss, Dehnungs-h) */
export function endetAufEinzellaut(wort: string): boolean {
  if (/(ch|ck|ng|ei|eu|äu|au|ie|ai|pf|ss)$/.test(wort)) return false;
  if (/[aeiouäöü]h$/.test(wort)) return false;
  return true;
}

/** In LAUTE-Reihenfolge, ohne Doppelte. */
function geordnet(bs: readonly Buchstabe[]): Buchstabe[] {
  const s = new Set(bs);
  return ANLAUT_LAUTE.filter((b) => s.has(b)).concat([...s].filter((b) => !ANLAUT_LAUTE.includes(b)));
}

/**
 * Aufgabe für Stufe 1–3. Ablenker kontrastieren mit dem gesuchten Laut (nie m/n, b/p/d, f/w,
 * nie zwei Zischlaute) und kommen möglichst aus `bekannt` (Buchstaben, die das Kind schon kennt).
 * Wirft, wenn das Tier für die Stufe nicht passt (der Aufrufer meldet es).
 */
export function stufenAufgabe(tier: Tier, stufe: 1 | 2 | 3, bekannt: readonly Buchstabe[] = []): StufenAufgabe {
  const wort = schreibwort(tier.name);
  const bs = buchstabenVon(wort);
  const imWort = new Set(bs);
  const vorrat = ANLAUT_LAUTE.filter((b) => !imWort.has(b));
  if (stufe === 3) {
    const alle = bs.map((_, i) => i);
    const ablenker = vorrat.filter((b) => bs.every((w) => kontrastiert(w, b)));
    const zwei = ablenker.length >= 2 ? waehleAblenker(bs[0] as Buchstabe, ablenker, 2, bekannt) : ablenker;
    return { offen: alle, tasten: geordnet([...bs, ...zwei]) };
  }
  const laut = anlautBuchstabe(tier);
  if (!laut) throw new Error(`„${tier.name}“ hat keinen gültigen Einzel-Anlaut und passt nicht zu Stufe ${stufe}.`);
  if (stufe === 1) return { offen: [0], tasten: geordnet([laut, ...waehleAblenker(laut, vorrat, 1, bekannt)]) };
  // Stufe 2: Anlaut und (bei Einzellaut-Ende) letzter Buchstabe offen, zusammen 3 Tasten.
  const letzter = bs.length - 1;
  const offen = letzter > 0 && endetAufEinzellaut(wort) ? [0, letzter] : [0];
  const gesucht = [...new Set(offen.map((i) => bs[i] as Buchstabe))];
  const passend = vorrat.filter((b) => gesucht.every((g) => kontrastiert(g, b)));
  return { offen, tasten: geordnet([...gesucht, ...waehleAblenker(laut, passend, 3 - gesucht.length, bekannt)]) };
}
