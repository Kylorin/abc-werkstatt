// Abnahmetests der ABC-Werkstatt — RICHTER-DATEI, nachts schreibgeschützt.
// Vertrag über data-testid. Die App darf intern beliebig gebaut sein, solange diese Tests grün sind.
// Spezifikation der Gruppen F0–F7, „Regal und Bedienschutz“, „Tonquellen“, „Querformat“:
// docs/konzept-spass-und-lernen.md. Nie echtes Netz zu OpenRouter: alle Aufrufe per page.route gemockt.
import { test, expect, Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const LAUTE = 'abcdefghijklmnopqrstuvwxyzäöüß'.split('');
const VOKALE = new Set('aeiouäöü'.split(''));
const EINSTELLUNGEN_SCHLUESSEL = 'abc-werkstatt:einstellungen:v1';
const TESTPAKET = join(process.cwd(), 'tests', 'fixtures', 'testpaket.zip');
/** Tiere des Testpakets mit gültigem Einzel-Anlaut (Schaf hat „sch“ und fehlt hier absichtlich). */
const ANLAUT_TIERE: Record<string, string> = { igel: 'i', maus: 'm', hase: 'h' };

/** Regal für die Bestandstests: die früheren Kacheln (Tiere, Freies Schreiben, Nachfüllen). */
const BESTANDS_REGAL = ['tiere', 'frei', 'nachfuellen'];

/**
 * Setzt vor JEDEM Laden der Seite die genannten Einstellungen (übrige gespeicherte Werte bleiben).
 * So überlebt z. B. das Regal ein page.goto('/'), während ein Test andere Schalter umlegt.
 */
async function einstellungen(page: Page, teil: Record<string, unknown>) {
  await page.addInitScript(([k, t]) => {
    const alt = JSON.parse(localStorage.getItem(k as string) || '{}');
    localStorage.setItem(k as string, JSON.stringify({ ...alt, ...(t as object) }));
  }, [EINSTELLUNGEN_SCHLUESSEL, teil] as const);
}

async function start(page: Page, teil: Record<string, unknown> | null = { regal: BESTANDS_REGAL }) {
  if (teil) await einstellungen(page, teil);
  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();
}

/** Regal-Kachel öffnen: erster Tipp spricht, zweiter öffnet (B1) — als Doppelklick. */
async function oeffne(page: Page, id: string) {
  const k = page.getByTestId(`modus-${id}`).first();
  await expect(k).toBeVisible();
  await k.dblclick();
}

/** Halten mit der Maus (B5/B7/B1). */
async function halte(page: Page, testid: string, ms: number) {
  const box = (await page.getByTestId(testid).first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function importiere(page: Page, zip: string | { name: string; mimeType: string; buffer: Buffer } = TESTPAKET) {
  await page.getByTestId('einstellungen').click();
  await page.getByTestId('paket-import').setInputFiles(zip);
}

/** Start mit Regal `regal`, Testpaket importieren, zurück auf den Start. */
async function mitPaket(page: Page, regal: string[], weitere: Record<string, unknown> = {}) {
  await start(page, { regal, ...weitere });
  await importiere(page);
  await expect(page.getByTestId('paketliste')).toContainText('Testtiere', { timeout: 10_000 });
  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();
}

/** Zählt gesprochene Texte der Browserstimme (statt echter Ausgabe; endet sofort). */
async function browserstimmeMitschreiben(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __gesprochen: string[] };
    w.__gesprochen = [];
    if (typeof speechSynthesis === 'undefined') return;
    speechSynthesis.speak = (u: SpeechSynthesisUtterance) => {
      if (u.text) w.__gesprochen.push(u.text);
      setTimeout(() => {
        u.onstart?.(new Event('start') as SpeechSynthesisEvent);
        u.onend?.(new Event('end') as SpeechSynthesisEvent);
      }, 20);
    };
  });
}
const gesprochen = (page: Page) => page.evaluate(() => (window as unknown as { __gesprochen: string[] }).__gesprochen);

/** Sichtbare Buchstabentasten (ohne Leer-/Löschtaste). */
const tasten = (page: Page) => page.locator('[data-testid^="taste-"]:not([data-testid="taste-leer"]):not([data-testid="taste-loeschen"])');
/** Tier-Medaillons der Wiese (ohne „andere“ und „noch mal“). */
const wiesenTiere = (page: Page) =>
  page.locator('[data-testid^="tier-wahl-"]:not([data-testid="tier-wahl-andere"]):not([data-testid="tier-wahl-nochmal"])');

// ===========================================================================
// Bestand
// ===========================================================================

test.describe('Start und Navigation', () => {
  test('Startseite bietet die drei Modi und Einstellungen', async ({ page }) => {
    await start(page);
    for (const id of ['modus-frei', 'modus-nachfuellen', 'modus-woerterbuch', 'einstellungen']) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  test('Bedienelemente sind Vektor-Icons (SVG), keine Emojis', async ({ page }) => {
    await start(page);
    for (const id of ['modus-frei', 'modus-nachfuellen', 'modus-woerterbuch', 'einstellungen']) {
      await expect(page.getByTestId(id).locator('svg')).toHaveCount(1);
      const text = (await page.getByTestId(id).innerText()) || '';
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

test.describe('Freies Schreiben (bewegliches Alphabet)', () => {
  test('Bildschirm-Alphabet: Kleinbuchstaben, Vokale blau / Konsonanten rot markiert', async ({ page }) => {
    await start(page);
    await oeffne(page, 'frei');
    for (const b of LAUTE) {
      const taste = page.getByTestId(`taste-${b}`);
      await expect(taste).toBeVisible();
      await expect(taste).toHaveText(b);
      await expect(taste).toHaveAttribute('data-art', VOKALE.has(b) ? 'vokal' : 'konsonant');
    }
  });

  test('Antippen und echte Tastatur schreiben in den Text', async ({ page }) => {
    await start(page);
    await oeffne(page, 'frei');
    await page.getByTestId('taste-m').click();
    await page.getByTestId('taste-a').click();
    await page.keyboard.press('m');
    await page.keyboard.press('a');
    await expect(page.getByTestId('text')).toHaveText('mama');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('text')).toHaveText('mam');
  });

  test('Buchstabe spielt den vorab aufgenommenen Laut ab', async ({ page }) => {
    await start(page);
    await oeffne(page, 'frei');
    const req = page.waitForRequest(r => /audio\/laute\/m(\.[a-z0-9]+)?\.mp3/.test(decodeURIComponent(r.url())));
    await page.getByTestId('taste-m').click();
    await req;
  });
});

test.describe('Nachfüllen', () => {
  test('richtig gefüllt, falsch abgewiesen, fertig gelobt, nächstes Wort kommt', async ({ page }) => {
    await start(page);
    await oeffne(page, 'nachfuellen');
    const ziel = page.getByTestId('zielwort');
    await expect(ziel).toBeVisible();
    const wort = (await ziel.getAttribute('data-wort'))!;
    expect(wort.length).toBeGreaterThan(1);
    const zeichen = Array.from(wort);

    // falscher Buchstabe: wird nicht eingesetzt, sanfte Rückmeldung
    const falsch = LAUTE.find(b => b !== zeichen[0])!;
    if (await page.getByTestId(`taste-${falsch}`).count()) {
      await page.getByTestId(`taste-${falsch}`).click();
      await expect(page.getByTestId('rueckmeldung')).toHaveAttribute('data-art', 'falsch');
      await expect(page.getByTestId('slot-0')).toHaveAttribute('data-gefuellt', 'nein');
    }

    for (let i = 0; i < zeichen.length; i++) {
      await page.getByTestId(`taste-${zeichen[i]}`).first().click();
      await expect(page.getByTestId(`slot-${i}`)).toHaveAttribute('data-gefuellt', 'ja');
    }
    await expect(page.getByTestId('rueckmeldung')).toHaveAttribute('data-art', 'geschafft');
    await expect
      .poll(async () => ziel.getAttribute('data-wort'), { timeout: 10_000 })
      .not.toBe(wort);
  });

  test('fertiges Wort wird ganz vorgelesen', async ({ page }) => {
    await start(page);
    await oeffne(page, 'nachfuellen');
    const wort = (await page.getByTestId('zielwort').getAttribute('data-wort'))!;
    const gesprochenReq = page.waitForRequest(r => decodeURIComponent(r.url()).includes(`audio/woerter/`), { timeout: 10_000 });
    for (const z of Array.from(wort)) await page.getByTestId(`taste-${z}`).first().click();
    await gesprochenReq;
  });
});

test.describe('Wörterbuch', () => {
  test('Wort hinzufügen, bleibt nach Neuladen, wird im Nachfüllen geübt, lässt sich löschen', async ({ page }) => {
    await start(page);
    await page.getByTestId('modus-woerterbuch').click();
    // alle anderen Wörter abwählen/löschen, damit das neue sicher drankommt
    const liste = page.getByTestId('wortliste');
    await expect(liste).toBeVisible();
    for (const btn of await page.locator('[data-testid^="wort-loeschen-"]').all()) await btn.click();
    await page.getByTestId('wort-eingabe').fill('igel');
    await page.getByTestId('wort-hinzufuegen').click();
    await expect(liste).toContainText('igel');

    await page.reload();
    await page.getByTestId('modus-woerterbuch').click().catch(() => {});
    await expect(page.getByTestId('wortliste')).toContainText('igel');

    await page.goto('/');
    await oeffne(page, 'nachfuellen');
    await expect(page.getByTestId('zielwort')).toHaveAttribute('data-wort', 'igel');

    await page.goto('/');
    await page.getByTestId('modus-woerterbuch').click();
    await page.getByTestId('wort-loeschen-igel').click();
    await expect(page.getByTestId('wortliste')).not.toContainText('igel');
  });
});

test.describe('Einstellungen', () => {
  test('Umschalter Buchstabennamen und Großbuchstaben, Tonquellen ohne Azure', async ({ page }) => {
    await start(page);
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('einstellung-namen')).toBeVisible();
    await expect(page.getByTestId('einstellung-gross')).toBeVisible();
    await expect(page.getByTestId('einstellung-livestimme')).toBeVisible();
    await expect(page.getByTestId('einstellung-spracheingabe')).toBeVisible();
    await expect(page.getByTestId('einstellung-openrouter-key')).toBeVisible();
    await expect(page.getByTestId('einstellung-azure-key')).toHaveCount(0);
    await page.getByTestId('einstellung-gross').click();
    await page.goto('/');
    await oeffne(page, 'frei');
    await expect(page.getByTestId('taste-m')).toHaveText('M');
  });

  test('Alte Azure-Einstellungen werden still verworfen', async ({ page }) => {
    await page.addInitScript((k) => {
      if (!sessionStorage.getItem('alt-gesetzt')) {
        sessionStorage.setItem('alt-gesetzt', '1');
        localStorage.setItem(k, JSON.stringify({ azureSchluessel: 'alt-geheim', azureRegion: 'westeurope', stimme: 'x', grossbuchstaben: true }));
      }
    }, EINSTELLUNGEN_SCHLUESSEL);
    await page.goto('/');
    await expect(page.getByTestId('start')).toBeVisible();
    const gespeichert = await page.evaluate((k) => localStorage.getItem(k) ?? '', EINSTELLUNGEN_SCHLUESSEL);
    expect(gespeichert).not.toContain('alt-geheim');
    expect(gespeichert).not.toContain('azure');
    expect(JSON.parse(gespeichert).grossbuchstaben).toBe(true);
  });

  test('Laut-Studio zeigt je Buchstabe Varianten zum Anhören und Auswählen', async ({ page }) => {
    await start(page);
    await page.getByTestId('einstellungen').click();
    await page.getByTestId('laut-studio').click();
    for (const b of ['b', 'd', 'k', 'm']) {
      expect(await page.locator(`[data-testid^="variante-${b}-"]`).count()).toBeGreaterThanOrEqual(2);
    }
  });
});

test.describe('Handy und PWA', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('kein horizontales Scrollen, Tasten groß genug für Kinderfinger', async ({ page }) => {
    await start(page);
    await oeffne(page, 'frei');
    const breite = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(breite).toBeLessThanOrEqual(390);
    const box = await page.getByTestId('taste-m').boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('installierbar: Manifest mit Icons und aktiver Service Worker', async ({ page, request }) => {
    await start(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(href!)).json();
    expect(manifest.display).toMatch(/standalone|fullscreen/);
    expect(manifest.icons.some((i: { sizes: string }) => i.sizes.includes('512'))).toBe(true);
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))).toBeGreaterThan(0);
  });
});

test.describe('Audio-Bestand', () => {
  test('Laute, Buchstabennamen und Startwörter liegen vorab vertont vor', async ({ request }) => {
    const res = await request.get('audio/manifest.json');
    expect(res.ok()).toBe(true);
    const m = await res.json();
    for (const b of LAUTE) {
      expect(m.laute[b], `Laut ${b}`).toBeTruthy();
      expect(m.namen[b], `Name ${b}`).toBeTruthy();
    }
    expect(Object.keys(m.woerter).length).toBeGreaterThanOrEqual(20);
    const probe = [m.laute['m'], m.namen['m'], Object.values(m.woerter)[0]] as string[];
    for (const p of probe) {
      const r = await request.get(p);
      expect(r.ok(), p).toBe(true);
      expect((await r.body()).length).toBeGreaterThan(1000);
    }
  });
});

test.describe('Datenschutz im Repo', () => {
  // Die privaten Begriffe (Name des Kindes, Serienwort, Arbeitsidentität …) stehen NICHT in dieser
  // öffentlichen Datei: in der CI kommen sie aus dem Actions-Secret VERBOTENE_BEGRIFFE, lokal aus der
  // gitignorierten tools/.lokal/verboten.txt. Ein regulärer Ausdruck je Zeile, ohne Groß/klein.
  // Fehlt die Liste, ist der Test ROT — ein Gate ohne Begriffe darf nie still grün sein.
  function privateBegriffe(): RegExp {
    const lokal = join(process.cwd(), 'tools', '.lokal', 'verboten.txt');
    const roh = process.env.VERBOTENE_BEGRIFFE || (existsSync(lokal) ? readFileSync(lokal, 'utf8') : '');
    const zeilen = roh.split(/\r?\n/).map(z => z.trim()).filter(z => z && !z.startsWith('#'));
    expect(zeilen.length, 'Liste verbotener Begriffe fehlt (Secret VERBOTENE_BEGRIFFE bzw. tools/.lokal/verboten.txt)').toBeGreaterThan(0);
    return new RegExp(zeilen.join('|'), 'i');
  }

  // Feste Muster, die nie öffentlich werden dürfen: Schlüssel-Header, UUIDs (z. B. Projekt-IDs eines
  // Secret-Stores), lokale Benutzerpfade und der Name des Secret-Stores.
  const FEST = new RegExp(
    [
      String.raw`Ocp-Apim-Subscription-Key:\s*[0-9a-zA-Z]{20,}`,
      String.raw`sk-or-v1-[0-9a-f]{20,}`,
      '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}',
      String.raw`[A-Za-z]:[\\/]Users[\\/]`,
      String.raw`/c/User` + 's/',
      ['infi', 'sical'].join(''),
    ].join('|'),
    'i',
  );

  test('kein Kindername, kein privater Begriff und kein Schlüssel im Code', () => {
    const privat = privateBegriffe();
    const treffer: string[] = [];
    const lauf = (dir: string) => {
      for (const n of readdirSync(dir)) {
        if (['node_modules', '.git', 'dist', 'dev-dist', 'test-results', 'playwright-report', 'abnahme-ergebnis', '.lokal', '.wt', '__pycache__'].includes(n)) continue;
        const p = join(dir, n);
        if (privat.test(n)) treffer.push(`${p} (Dateiname)`);
        if (statSync(p).isDirectory()) lauf(p);
        else if (/\.(ts|js|mjs|html|css|json|md|py|sh|yml|webmanifest|svg|txt)$/.test(n)) {
          const inhalt = readFileSync(p, 'utf8');
          if (privat.test(inhalt) || FEST.test(inhalt)) treffer.push(p);
        }
      }
    };
    lauf(process.cwd());
    expect(treffer).toEqual([]);
  });

  test('neue Commits (seit der Bereinigungs-Basis) bringen nichts davon in die Historie', () => {
    // Prüft jede HINZUGEFÜGTE Zeile, jeden Dateinamen und jede Commit-Nachricht seit BASIS.
    // Ältere Commits vor BASIS sind bekannt belastet und brauchen eine Bereinigung der Historie.
    const BASIS = 'e339fec';
    const git = (args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    expect(git(['rev-parse', '--is-shallow-repository']).trim(), 'CI braucht die volle Historie (fetch-depth: 0)').toBe('false');
    const privat = privateBegriffe();
    const log = git(['log', '-p', '--no-color', '--no-ext-diff', '--format=commit %H%n%B', `${BASIS}..HEAD`]);
    const treffer: string[] = [];
    let commit = '';
    for (const zeile of log.split('\n')) {
      if (zeile.startsWith('commit ')) commit = zeile.slice(7, 19);
      const geprueft = zeile.startsWith('-') && !zeile.startsWith('--- ') ? '' : zeile; // entfernte Zeilen zählen nicht
      if (privat.test(geprueft) || FEST.test(geprueft)) treffer.push(`${commit}: ${zeile.slice(0, 1)}… (Zeile mit Treffer)`);
    }
    expect(treffer).toEqual([]);
  });
});

test.describe('Tier-Paket', () => {
  const TIERE = ['igel', 'maus', 'hase', 'schaf'];

  async function importiereBestand(page: Page) {
    await start(page);
    await importiere(page);
    await expect(page.getByTestId('paketliste')).toContainText('Testtiere', { timeout: 10_000 });
    await page.goto('/');
    await expect(page.getByTestId('modus-tiere')).toContainText('Testtiere');
  }

  test('Import: Paket erscheint in der Liste und als Kachel auf dem Start, bleibt nach Neuladen', async ({ page }) => {
    await importiereBestand(page);
    await page.reload();
    await expect(page.getByTestId('start')).toBeVisible();
    await expect(page.getByTestId('modus-tiere')).toContainText('Testtiere');
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('paketliste')).toContainText('Testtiere');
  });

  test('Tiere schreiben (Stufe 4): falsch wackelt, richtig geschafft, Tier freut sich, Weiter-Knopf', async ({ page }) => {
    await einstellungen(page, { tierStufe: 4 });
    await importiereBestand(page);
    await oeffne(page, 'tiere');
    await expect(page.getByTestId('tier-wiese')).toBeVisible();
    await wiesenTiere(page).first().dblclick();
    await expect(page.getByTestId('tier-bild')).toBeVisible();
    const ziel = page.getByTestId('zielwort');
    await expect(ziel).toBeVisible();
    const wort = (await ziel.getAttribute('data-wort'))!;
    expect(TIERE).toContain(wort);
    const zeichen = Array.from(wort);

    const falsch = LAUTE.find(b => b !== zeichen[0])!;
    await page.getByTestId(`taste-${falsch}`).click();
    await expect(page.getByTestId('rueckmeldung')).toHaveAttribute('data-art', 'falsch');

    for (const z of zeichen) await page.getByTestId(`taste-${z}`).first().click();
    await expect(page.getByTestId('rueckmeldung')).toHaveAttribute('data-art', 'geschafft');
    await expect(page.getByTestId('tier-freude')).toBeVisible();
    await expect(page.getByTestId('tier-weiter')).toBeVisible();
    await page.getByTestId('tier-weiter').click();
    await expect(page.getByTestId('tier-wiese')).toBeVisible();
  });

  test('Freies Schreiben erkennt Tiernamen', async ({ page }) => {
    await importiereBestand(page);
    await oeffne(page, 'frei');
    for (const z of ['i', 'g', 'e', 'l']) await page.getByTestId(`taste-${z}`).click();
    await expect(page.getByTestId('tier-freude')).toBeVisible({ timeout: 10_000 });
  });

  test('Paket löschen: Kachel verschwindet vom Start', async ({ page }) => {
    await importiereBestand(page);
    await page.getByTestId('einstellungen').click();
    await page.getByTestId('paket-loeschen-testtiere').click();
    await expect(page.getByTestId('paketliste')).not.toContainText('Testtiere');
    await page.goto('/');
    await expect(page.getByTestId('start')).toBeVisible();
    await expect(page.getByTestId('modus-tiere')).toHaveCount(0);
  });
});

// ===========================================================================
// Neuer Bau: docs/konzept-spass-und-lernen.md
// ===========================================================================

/** Ein Paket-Zip im Test bauen (für Ablehnungsfälle). */
function paketZip(tiere: unknown[]): { name: string; mimeType: string; buffer: Buffer } {
  const svg = strToU8('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
  const paket = { format: 'abc-werkstatt-tierpaket/1', id: 'kaputt', titel: 'Kaputt', sprache: 'de-DE', tiere };
  const zip = zipSync({ 'paket.json': strToU8(JSON.stringify(paket)), 'a.svg': svg, 'b.svg': svg });
  return { name: 'kaputt.zip', mimeType: 'application/zip', buffer: Buffer.from(zip) };
}

test.describe('F0 Paketfelder', () => {
  test('Import übernimmt die optionalen Felder (anlaut, silben, bewegung, raetsel, situationen, Audio)', async ({ page }) => {
    await mitPaket(page, ['frei']);
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('paketliste')).toContainText('4 Tiere');
    const tiere = await page.evaluate(
      () =>
        new Promise<Record<string, unknown>[]>((ok, fehler) => {
          const r = indexedDB.open('abc-werkstatt-pakete');
          r.onerror = () => fehler(r.error);
          r.onsuccess = () => {
            const g = r.result.transaction('kv').objectStore('kv').get('pakete');
            g.onerror = () => fehler(g.error);
            g.onsuccess = () => ok(g.result.testtiere.tiere);
          };
        }),
    );
    const nach = Object.fromEntries(tiere.map((t) => [t['id'], t]));
    expect(nach['igel']).toMatchObject({ anlaut: 'i', silben: ['i', 'gel'], bewegung: 'rollt' });
    expect((nach['igel']!['raetsel'] as string[]).length).toBe(2);
    expect(nach['schaf']).toMatchObject({ anlaut: 'sch' });
    expect(nach['maus']!['situationen']).toEqual([expect.objectContaining({ id: 'maus-regal', helfer: 'hase' })]);
    expect(nach['hase']!['audio']).toMatchObject({ silben: [expect.any(String), expect.any(String)] });
  });

  test('Anlaut-Spiele kennen nur Tiere mit gültigem Einzel-Anlaut (Phonogramm-Tier fehlt)', async ({ page }) => {
    await mitPaket(page, ['frei'], { lautRuftTier: true });
    await oeffne(page, 'frei');
    for (const [tier, laut] of Object.entries(ANLAUT_TIERE)) {
      await page.getByTestId(`taste-${laut}`).click();
      await expect(page.getByTestId('anlaut-gucker')).toHaveAttribute('data-tier', tier, { timeout: 5_000 });
    }
    // „Schaf“ fängt mit dem Buchstaben s an, klingt aber „sch“ — es darf unter „s“ nicht kommen.
    await page.getByTestId('taste-s').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-testid="anlaut-gucker"][data-tier="schaf"]')).toHaveCount(0);
  });

  test('Ungültige Zusatzfelder lehnen das Paket mit Elternmeldung ab', async ({ page }) => {
    await start(page);
    await importiere(page, paketZip([
      { id: 'a', name: 'Ab', artikel: 'der', bild: 'a.svg', situationen: [{ id: 's1', problem: 'P', helfer: 'gibtsnicht', loesung: 'L' }] },
      { id: 'b', name: 'Bo', artikel: 'der', bild: 'b.svg', silben: ['bo'], audio: { silben: ['x.mp3', 'y.mp3'] } },
    ]));
    const meldung = page.getByTestId('paket-meldung');
    await expect(meldung).toContainText('gibtsnicht', { timeout: 10_000 });
    await expect(meldung).toContainText('audio.silben');
    await expect(page.getByTestId('paketliste')).not.toContainText('Kaputt');
  });
});

test.describe('F1 Erster Laut', () => {
  test('Tier-Wiese: drei Medaillons aus lautreinen Anlaut-Tieren, andere Tiere und noch mal', async ({ page }) => {
    await mitPaket(page, ['tiere']);
    await oeffne(page, 'tiere');
    await expect(page.getByTestId('tier-wiese')).toBeVisible();
    await expect(wiesenTiere(page)).toHaveCount(3);
    await expect(page.getByTestId('tier-wahl-schaf')).toHaveCount(0); // Stufe 1: kein Phonogramm-Tier
    await expect(page.getByTestId('tier-wahl-andere')).toBeVisible();
    await page.getByTestId('tier-wahl-andere').click();
    await expect(wiesenTiere(page)).toHaveCount(3);
    for (const t of await wiesenTiere(page).all()) await expect(t).toHaveAttribute('data-bewegung', /^(huepft|fliegt|kriecht|schwimmt|rollt|klettert|watschelt|schlaengelt|stampft|tanzt)$/);
  });

  test('Stufe 1: nur der Anlaut fehlt, zwei Tasten, Hilfe nach dem 2. Fehlversuch, kein Auto-Weiter', async ({ page }) => {
    await mitPaket(page, ['tiere']);
    await oeffne(page, 'tiere');
    await page.getByTestId('tier-wahl-hase').click();
    await page.getByTestId('tier-schreiben').click();
    await expect(page.getByTestId('tier-stufe')).toHaveAttribute('data-stufe', '1');
    await expect(page.getByTestId('zielwort')).toHaveAttribute('data-wort', 'hase');
    await expect(page.getByTestId('slot-0')).toHaveAttribute('data-offen', 'ja');
    await expect(page.getByTestId('slot-0')).toHaveAttribute('data-gefuellt', 'nein');
    for (const i of [1, 2, 3]) {
      await expect(page.getByTestId(`slot-${i}`)).toHaveAttribute('data-gefuellt', 'ja');
      await expect(page.getByTestId(`slot-${i}`)).toHaveAttribute('data-offen', 'nein');
    }
    await expect(tasten(page)).toHaveCount(2);
    await expect(page.getByTestId('taste-h')).toBeVisible();
    const ablenker = (await tasten(page).evaluateAll((ts) => ts.map((t) => t.getAttribute('data-testid')))).find((t) => t !== 'taste-h')!;
    await page.getByTestId(ablenker).click();
    await expect(page.getByTestId('rueckmeldung')).toHaveAttribute('data-art', 'falsch');
    await expect(page.getByTestId('taste-h')).not.toHaveAttribute('data-hinweis', 'ja');
    await page.getByTestId(ablenker).click();
    await expect(page.getByTestId('taste-h')).toHaveAttribute('data-hinweis', 'ja');
    await page.getByTestId('taste-h').click();
    await expect(page.getByTestId('rueckmeldung')).toHaveAttribute('data-art', 'geschafft');
    await expect(page.getByTestId('tier-freude')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('tier-weiter')).toBeVisible();
    await page.waitForTimeout(6000); // kein Auto-Weiter: das Tier bleibt sitzen
    await expect(page.getByTestId('tier-freude')).toBeVisible();
    await expect(page.getByTestId('tier-wiese')).toHaveCount(0);
    await page.getByTestId('tier-weiter').click();
    await expect(page.getByTestId('tier-wiese')).toBeVisible();
    await page.getByTestId('tier-wahl-nochmal').click();
    await expect(page.getByTestId('zielwort')).toHaveAttribute('data-wort', 'hase');
  });

  test('Stufe 2: Anlaut und Endlaut offen, drei Tasten', async ({ page }) => {
    await mitPaket(page, ['tiere'], { tierStufe: 2 });
    await oeffne(page, 'tiere');
    await page.getByTestId('tier-wahl-igel').dblclick();
    await expect(page.getByTestId('tier-stufe')).toHaveAttribute('data-stufe', '2');
    await expect(page.getByTestId('slot-0')).toHaveAttribute('data-offen', 'ja');
    await expect(page.getByTestId('slot-3')).toHaveAttribute('data-offen', 'ja');
    await expect(page.getByTestId('slot-1')).toHaveAttribute('data-gefuellt', 'ja');
    await expect(tasten(page)).toHaveCount(3);
  });

  test('Stufe 4: volles Alphabet', async ({ page }) => {
    await mitPaket(page, ['tiere'], { tierStufe: 4 });
    await oeffne(page, 'tiere');
    await wiesenTiere(page).first().dblclick();
    await expect(page.getByTestId('tier-stufe')).toHaveAttribute('data-stufe', '4');
    await expect(tasten(page)).toHaveCount(30);
  });

  test('Stufe im Elternbereich einstellbar; Gute Nacht nach eingestellter Rundenzahl, Tipp weckt', async ({ page }) => {
    await mitPaket(page, ['tiere'], { rundenBisGuteNacht: 1 });
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('einstellung-tier-stufe')).toBeVisible();
    await page.goto('/');
    await oeffne(page, 'tiere');
    await page.getByTestId('tier-wahl-maus').dblclick();
    await page.getByTestId('taste-m').click();
    await expect(page.getByTestId('tier-weiter')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('tier-weiter').click();
    await expect(page.getByTestId('gute-nacht')).toBeVisible();
    await expect(page.getByTestId('tier-wiese')).toHaveCount(0);
    await page.getByTestId('gute-nacht').click();
    await expect(page.getByTestId('tier-wiese')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('F2 Laut ruft Tier', () => {
  test('Nach dem Laut lugt das Anlaut-Tier hervor und verschwindet still wieder', async ({ page }) => {
    await mitPaket(page, ['frei']);
    await oeffne(page, 'frei');
    await page.getByTestId('taste-i').click();
    const gucker = page.getByTestId('anlaut-gucker');
    await expect(gucker).toHaveAttribute('data-tier', 'igel', { timeout: 5_000 });
    await expect(gucker).toHaveAttribute('data-laut', 'i');
    await expect(gucker).toHaveAttribute('data-offen', 'ja');
    await expect(page.getByTestId('anlaut-gucker-tier')).toBeVisible();
    await expect.poll(async () => (await gucker.count()) === 0 || (await gucker.getAttribute('data-offen')) === 'nein', { timeout: 8_000 }).toBe(true);
  });

  test('Kein passendes Tier: es kommt einfach nichts', async ({ page }) => {
    await mitPaket(page, ['frei']);
    await oeffne(page, 'frei');
    await page.getByTestId('taste-o').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-testid="anlaut-gucker"][data-offen="ja"]')).toHaveCount(0);
  });

  test('Abschaltbar im Elternbereich', async ({ page }) => {
    await mitPaket(page, ['frei']);
    await page.getByTestId('einstellungen').click();
    await page.getByTestId('einstellung-laut-ruft-tier').click();
    await page.goto('/');
    await oeffne(page, 'frei');
    await page.getByTestId('taste-i').click();
    await page.waitForTimeout(1500);
    await expect(page.locator('[data-testid="anlaut-gucker"][data-offen="ja"]')).toHaveCount(0);
  });

  test('Regal-Kachel öffnet den kleinen Kasten mit eingestellten Buchstaben', async ({ page }) => {
    await mitPaket(page, ['laut-ruft-tier'], { kastenBuchstaben: ['m', 'a', 'i', 's'], kindAnfang: 'o' });
    await oeffne(page, 'laut-ruft-tier');
    await expect(page.getByTestId('kleiner-kasten')).toBeVisible();
    const da = await tasten(page).evaluateAll((ts) => ts.map((t) => t.getAttribute('data-testid')!.slice(6)).sort());
    expect(da.length).toBeGreaterThanOrEqual(4);
    expect(da.length).toBeLessThanOrEqual(6);
    for (const b of ['m', 'a', 'i', 's', 'o']) expect(da).toContain(b);
    await page.goto('/');
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('einstellung-kasten-buchstaben')).toBeVisible();
  });
});

test.describe('F3 Decke', () => {
  test('Hilfeleiter: jeder Tipp ein deutlicherer Hinweis, die Auflösung kommt immer', async ({ page }) => {
    await mitPaket(page, ['decke']);
    await oeffne(page, 'decke');
    const decke = page.getByTestId('decke');
    await expect(decke).toHaveAttribute('data-hinweis', '0');
    const tier = (await decke.getAttribute('data-tier'))!;
    expect(Object.keys(ANLAUT_TIERE)).toContain(tier);
    await expect(page.getByTestId('decke-stufe')).toHaveAttribute('data-stufe', '0');
    for (const h of ['1', '2', '3', '4']) {
      await decke.click();
      await expect(decke).toHaveAttribute('data-hinweis', h);
    }
    await expect(page.getByTestId('decke-tier')).toBeVisible();
    await expect(page.getByTestId('decke-anlaut')).toHaveText(ANLAUT_TIERE[tier]!);
  });

  test('Stufe 0: zwei Medaillons, das richtige zieht die Decke weg, das andere nicht', async ({ page }) => {
    await mitPaket(page, ['decke']);
    await oeffne(page, 'decke');
    const decke = page.getByTestId('decke');
    const tier = (await decke.getAttribute('data-tier'))!;
    const wahl = page.locator('[data-testid^="decke-wahl-"]:not([data-testid^="decke-wahl-taste-"])');
    await expect(wahl).toHaveCount(2);
    await expect(page.getByTestId('decke-wahl-schaf')).toHaveCount(0);
    const andere = (await wahl.evaluateAll((ws) => ws.map((w) => w.getAttribute('data-testid')!))).find((t) => t !== `decke-wahl-${tier}`)!;
    await page.getByTestId(andere).click();
    await expect(page.getByTestId('decke-tier')).toBeHidden();
    await page.getByTestId(`decke-wahl-${tier}`).click();
    await expect(page.getByTestId('decke-tier')).toBeVisible();
    await expect(decke).toHaveAttribute('data-hinweis', '4');
  });

  test('Stufe 1: zwei große Buchstaben statt Medaillons', async ({ page }) => {
    await mitPaket(page, ['decke'], { deckeStufe: 1 });
    await oeffne(page, 'decke');
    const tier = (await page.getByTestId('decke').getAttribute('data-tier'))!;
    await expect(page.getByTestId('decke-stufe')).toHaveAttribute('data-stufe', '1');
    await expect(page.locator('[data-testid^="decke-wahl-taste-"]')).toHaveCount(2);
    await page.getByTestId(`decke-wahl-taste-${ANLAUT_TIERE[tier]}`).click();
    await expect(page.getByTestId('decke-tier')).toBeVisible();
  });
});

test.describe('F4 Bewegung', () => {
  test('Tier-Freude trägt die Bewegung aus dem Paket', async ({ page }) => {
    await mitPaket(page, ['frei'], { lautRuftTier: false });
    await oeffne(page, 'frei');
    for (const z of ['m', 'a', 'u', 's']) await page.getByTestId(`taste-${z}`).click();
    await expect(page.getByTestId('tier-freude')).toHaveAttribute('data-bewegung', 'kriecht', { timeout: 10_000 });
  });

  test('Wiesen-Medaillons tragen ihre Bewegung, ruhige Darstellung bleibt bedienbar', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await mitPaket(page, ['tiere']);
    await oeffne(page, 'tiere');
    await expect(page.getByTestId('tier-wahl-hase')).toHaveAttribute('data-bewegung', 'huepft');
    await expect(page.getByTestId('tier-wahl-igel')).toHaveAttribute('data-bewegung', 'rollt');
  });
});

test.describe('F5 Silben', () => {
  test('Nur Tiere mit Silben und Silben-Audio; jeder Tipp spielt die nächste Silbe', async ({ page }) => {
    await mitPaket(page, ['silben']);
    await oeffne(page, 'silben');
    await expect(page.getByTestId('tier-wahl-hase')).toBeVisible();
    await expect(page.getByTestId('tier-wahl-igel')).toHaveCount(0); // ohne audio.silben
    await page.getByTestId('tier-wahl-hase').dblclick();
    await expect(page.getByTestId('silben-tier')).toBeVisible();
    await expect(page.locator('[data-testid^="silbe-"]')).toHaveCount(2);
    await expect(page.getByTestId('silbe-0')).toHaveAttribute('data-gespielt', 'nein');
    await page.getByTestId('silbe-1').click(); // beliebiger Fleck: es kommt die NÄCHSTE Silbe
    await expect(page.getByTestId('silbe-0')).toHaveAttribute('data-gespielt', 'ja');
    await expect(page.getByTestId('silbe-1')).toHaveAttribute('data-gespielt', 'nein');
    await page.getByTestId('silbe-0').click();
    await expect(page.getByTestId('silbe-1')).toHaveAttribute('data-gespielt', 'ja');
    await expect(page.getByTestId('silben-bogen')).toBeVisible();
    await expect(page.getByTestId('silben-fertig')).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('F6 Wer hilft', () => {
  test('Kachel nur mit Situationen im Paket', async ({ page }) => {
    await start(page, { regal: ['geschichten', 'frei'] });
    await expect(page.getByTestId('modus-frei')).toBeVisible();
    await expect(page.getByTestId('modus-geschichten')).toHaveCount(0);
  });

  test('Problem, zwei Helfer, Umlenken beim falschen, Anlaut legen beim richtigen, Lösung', async ({ page }) => {
    await mitPaket(page, ['geschichten']);
    await oeffne(page, 'geschichten');
    const g = page.getByTestId('geschichte');
    await expect(g).toHaveAttribute('data-situation', 'maus-regal');
    await expect(page.getByTestId('geschichte-problemtier')).toBeVisible();
    const helfer = page.locator('[data-testid^="helfer-wahl-"]');
    await expect(helfer).toHaveCount(2, { timeout: 15_000 });
    const anderer = (await helfer.evaluateAll((hs) => hs.map((h) => h.getAttribute('data-testid')!))).find((t) => t !== 'helfer-wahl-hase')!;
    await page.getByTestId(anderer).click();
    await expect(page.getByTestId('geschichte-schreiben')).toHaveCount(0);
    await expect(helfer).toHaveCount(2, { timeout: 15_000 });
    await page.getByTestId('helfer-wahl-hase').click();
    await expect(page.getByTestId('geschichte-schreiben')).toBeVisible({ timeout: 10_000 });
    await expect(tasten(page)).toHaveCount(2);
    await page.getByTestId('taste-h').click();
    await expect(page.getByTestId('geschichte-loesung')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('F7 Meine Leute', () => {
  // 1×1-PNG (hell), erfundenes Wort — keine echten Familiendaten im Test.
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

  test('Person anlegen, im Regal antippen, Anlaut legen, wieder löschen — nur lokal', async ({ page }) => {
    await start(page, { regal: ['leute'] });
    await page.getByTestId('einstellungen').click();
    await page.getByTestId('leute-wort').fill('mimo');
    await page.getByTestId('leute-foto').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await page.getByTestId('leute-anlegen').click();
    const loeschen = page.locator('[data-testid^="leute-loeschen-"]');
    await expect(loeschen).toHaveCount(1, { timeout: 10_000 });
    const id = (await loeschen.getAttribute('data-testid'))!.slice('leute-loeschen-'.length);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain('mimo');

    await page.goto('/');
    await oeffne(page, 'leute');
    await expect(page.getByTestId('leute-wiese')).toBeVisible();
    await expect(page.getByTestId(`leute-${id}`).locator('img')).toBeVisible();
    await page.getByTestId(`leute-${id}`).dblclick();
    await expect(page.getByTestId('zielwort')).toHaveAttribute('data-wort', 'mimo');
    await expect(tasten(page)).toHaveCount(2);
    await page.getByTestId('taste-m').click();
    await expect(page.getByTestId('rueckmeldung')).toHaveAttribute('data-art', 'geschafft');

    await page.goto('/');
    await page.getByTestId('einstellungen').click();
    await page.getByTestId(`leute-loeschen-${id}`).click();
    await expect(page.locator('[data-testid^="leute-loeschen-"]')).toHaveCount(0);
  });
});

test.describe('Regal und Bedienschutz', () => {
  test('Standard-Regal: höchstens vier Kacheln, ohne Freies Schreiben und Nachfüllen', async ({ page }) => {
    await start(page, null);
    await expect(page.getByTestId('regal')).toHaveAttribute('aria-busy', 'false');
    const kacheln = page.getByTestId('regal').locator('[data-testid^="modus-"]');
    expect(await kacheln.count()).toBeLessThanOrEqual(4);
    await expect(page.getByTestId('modus-frei')).toHaveCount(0);
    await expect(page.getByTestId('modus-nachfuellen')).toHaveCount(0);
    await expect(page.getByTestId('einstellungen')).toBeVisible();
  });

  test('Zu viele Arbeiten im Regal: es bleiben vier Kacheln', async ({ page }) => {
    await start(page, { regal: ['frei', 'nachfuellen', 'laut-ruft-tier', 'decke', 'silben', 'leute'] });
    await expect(page.getByTestId('regal')).toHaveAttribute('aria-busy', 'false');
    await expect(page.getByTestId('regal').locator('[data-testid^="modus-"]')).toHaveCount(4);
  });

  test('Regal im Elternbereich wählen (höchstens vier)', async ({ page }) => {
    await start(page, null);
    await page.getByTestId('einstellungen').click();
    const frei = page.getByTestId('einstellung-regal-frei');
    if (!(await frei.isChecked())) {
      // Platz schaffen, falls schon vier gewählt sind
      for (const id of ['silben', 'decke']) {
        const k = page.getByTestId(`einstellung-regal-${id}`);
        if (await k.isChecked()) await k.click();
      }
      await frei.click();
    }
    await expect(frei).toBeChecked();
    const an = page.locator('[data-testid^="einstellung-regal-"]:checked');
    expect(await an.count()).toBeLessThanOrEqual(4);
    await page.goto('/');
    await expect(page.getByTestId('modus-frei')).toBeVisible();
  });

  test('Erster Tipp spricht den Kachelnamen aus einer Datei, zweiter Tipp öffnet', async ({ page }) => {
    await browserstimmeMitschreiben(page);
    await start(page, { regal: ['frei'] });
    const kachel = page.getByTestId('modus-frei');
    const ton = page.waitForRequest((r) => /audio\/saetze\/kachel\.frei\.\d+\.mp3/.test(decodeURIComponent(r.url())));
    await kachel.click();
    await ton;
    await expect(kachel).toHaveAttribute('data-bereit', 'ja');
    await expect(page.getByTestId('start')).toBeVisible();
    await kachel.click();
    await expect(page.getByTestId('taste-m')).toBeVisible();
    expect(await gesprochen(page)).toEqual([]); // feste Sätze nie über die Live-Stimme
  });

  test('Halten öffnet eine Kachel direkt', async ({ page }) => {
    await start(page, { regal: ['frei'] });
    await halte(page, 'modus-frei', 900);
    await expect(page.getByTestId('taste-m')).toBeVisible();
  });

  test('Zurück in Kind-Modi nur nach 1 s Halten; Elternbereich normal', async ({ page }) => {
    await start(page, { regal: ['frei'] });
    await oeffne(page, 'frei');
    const zurueck = page.getByTestId('zurueck');
    await expect(zurueck).toHaveAttribute('data-halten-ms', '1000');
    await zurueck.click();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('taste-m')).toBeVisible();
    await halte(page, 'zurueck', 1300);
    await expect(page.getByTestId('start')).toBeVisible();
    await page.getByTestId('einstellungen').click();
    await page.getByTestId('zurueck').click();
    await expect(page.getByTestId('start')).toBeVisible();
  });

  test('Android-Zurück verlässt den Kind-Modus nicht (History-Falle)', async ({ page }) => {
    await start(page, { regal: ['frei'] });
    await oeffne(page, 'frei');
    await expect(page.locator('.rahmen[data-falle="ja"]')).toHaveCount(1);
    await page.evaluate(() => history.back());
    await expect.poll(() => page.locator('.rahmen').getAttribute('data-falle-gefangen')).toBe('1');
    await expect(page.getByTestId('taste-m')).toBeVisible();
  });

  test('Wake Lock hält den Bildschirm an, solange ein Kind-Modus offen ist', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __wl: { an: number; frei: number } };
      w.__wl = { an: 0, frei: 0 };
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async () => {
            w.__wl.an++;
            const t = new EventTarget();
            return Object.assign(t, { release: async () => { w.__wl.frei++; t.dispatchEvent(new Event('release')); } });
          },
        },
      });
    });
    await start(page, { regal: ['frei'] });
    await oeffne(page, 'frei');
    await expect(page.locator('.rahmen')).toHaveAttribute('data-wachhalten', 'an');
    await halte(page, 'zurueck', 1300);
    await expect(page.getByTestId('start')).toBeVisible();
    const wl = await page.evaluate(() => (window as unknown as { __wl: { an: number; frei: number } }).__wl);
    expect(wl.an).toBeGreaterThanOrEqual(1);
    expect(wl.frei).toBe(wl.an);
  });

  test('Wegräumen nur per Halten, mit Wisch-Geräusch und Satz; Zurückholen spricht', async ({ page }) => {
    await start(page, { regal: ['frei'], lautRuftTier: false });
    await oeffne(page, 'frei');
    await page.getByTestId('taste-m').click();
    await page.getByTestId('taste-a').click();
    await expect(page.getByTestId('text')).toHaveText('ma');
    await page.getByTestId('text-leeren').click();
    await page.waitForTimeout(300);
    await expect(page.getByTestId('text')).toHaveText('ma'); // kurzer Tipp räumt nicht weg
    const wisch = page.waitForRequest((r) => /audio\/saetze\/geraeusch\.wisch\.\d+\.mp3/.test(decodeURIComponent(r.url())));
    const satz = page.waitForRequest((r) => /audio\/saetze\/wegraeumen\.satz\.\d+\.mp3/.test(decodeURIComponent(r.url())), { timeout: 10_000 });
    await halte(page, 'text-leeren', 900);
    await expect(page.getByTestId('text')).toHaveText('');
    await wisch;
    await satz;
    const zurueck = page.waitForRequest((r) => /audio\/saetze\/zurueckholen\.satz\.\d+\.mp3/.test(decodeURIComponent(r.url())), { timeout: 10_000 });
    await page.getByTestId('text-zurueckholen').click();
    await expect(page.getByTestId('text')).toHaveText('ma');
    await zurueck;
  });

  test('Patschhand: nur der erste Finger zählt', async ({ page }) => {
    await start(page, { regal: ['frei'], lautRuftTier: false });
    await oeffne(page, 'frei');
    await page.evaluate(() => {
      const m = document.querySelector('[data-testid="taste-m"]')!;
      const a = document.querySelector('[data-testid="taste-a"]')!;
      const ev = (typ: string, id: number) => new PointerEvent(typ, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true, button: 0 });
      m.dispatchEvent(ev('pointerdown', 1));
      a.dispatchEvent(ev('pointerdown', 2));
      a.dispatchEvent(ev('pointerup', 2));
      m.dispatchEvent(ev('pointerup', 1));
    });
    await expect(page.getByTestId('text')).toHaveText('m');
  });
});

test.describe('Tonquellen', () => {
  /** Feste Sätze aus der Ton-Gesamtliste 6a: Schlüssel → Mindestzahl an Varianten. */
  function festeSaetze(): Record<string, number> {
    const anlautLaute = LAUTE.filter((b) => !['c', 'q', 'x', 'y', 'ß'].includes(b));
    const s: Record<string, number> = {
      'frage.wer-unter-decke': 3, 'frage.wer-hilft': 3, 'aufforderung.klatschen': 3, 'aufforderung.weiter': 3,
      'lob.allgemein': 4, 'lob.anlaut': 3, 'lob.leute': 3, 'freude.allgemein': 3,
      'geschichte.gemeinsam': 3, 'geschichte.ende': 3, 'wegraeumen.satz': 4, 'zurueckholen.satz': 3,
      'hilfe.nochmal': 3, 'zurueck.halten': 1, 'gutenacht.satz': 3, 'gutenacht.wecken': 2,
      'geraeusch.wisch': 3, 'geraeusch.zurueck': 2, 'geraeusch.schlaflied': 1,
      'geraeusch.decke-wackelt': 2, 'geraeusch.decke-weg': 2, 'geraeusch.plopp': 2, 'geraeusch.trommel': 3,
      'geraeusch.oh-oh': 2, 'geraeusch.loesung': 2, 'geraeusch.klack': 3,
    };
    for (const k of ['tiere', 'laut-ruft-tier', 'decke', 'silben', 'geschichten', 'leute', 'frei', 'nachfuellen']) s[`kachel.${k}`] = 2;
    for (const a of ['huepft', 'fliegt', 'kriecht', 'schwimmt', 'rollt', 'klettert', 'watschelt', 'schlaengelt', 'stampft', 'tanzt']) s[`geraeusch.bewegung.${a}`] = 2;
    for (const b of anlautLaute) {
      s[`einladung.${b}`] = 3;
      s[`frage.wer-faengt-an.${b}`] = 3;
    }
    return s;
  }

  test('manifest.saetze ist vollständig, gedehnte Laute fehlen nicht, alle Dateien sind abrufbar', async ({ request }) => {
    const m = await (await request.get('audio/manifest.json')).json();
    const fehlt: string[] = [];
    for (const [k, n] of Object.entries(festeSaetze())) {
      const v = m.saetze?.[k];
      if (!Array.isArray(v) || v.length < n) fehlt.push(`${k} (${Array.isArray(v) ? v.length : 0}/${n})`);
    }
    for (const b of LAUTE) if (!m.laute_lang?.[b]) fehlt.push(`laute_lang.${b}`);
    expect(fehlt).toEqual([]);
    const dateien = [...Object.values(m.saetze as Record<string, string[]>).flat(), ...Object.values(m.laute_lang as Record<string, string>)];
    const kaputt: string[] = [];
    for (const d of new Set(dateien)) {
      const r = await request.get(d);
      if (!r.ok() || (await r.body()).length < 200) kaputt.push(d);
    }
    expect(kaputt).toEqual([]);
  });

  test('Live-Stimme Browser liest frei Geschriebenes (auch Kauderwelsch)', async ({ page }) => {
    await browserstimmeMitschreiben(page);
    await start(page, { regal: ['frei'], liveStimme: 'browser', lautRuftTier: false });
    await oeffne(page, 'frei');
    for (const z of ['m', 'u', 'p', 'o', 'z']) await page.getByTestId(`taste-${z}`).click();
    await page.getByTestId('vorlesen').click();
    await expect.poll(() => gesprochen(page)).toContain('mupoz');
  });

  test('Live-Stimme OpenRouter: eigener Schlüssel, gpt-audio-mini, einmal erzeugt und gecacht (gemockt)', async ({ page }) => {
    const anfragen: { auth: string | null; body: string }[] = [];
    // Antwort im Streaming-Format (SSE) mit PCM16-Audio, 24 kHz mono — 0,1 s Stille.
    const pcm = Buffer.alloc(4800).toString('base64');
    await page.route('**/openrouter.ai/**', async (route) => {
      anfragen.push({ auth: route.request().headers()['authorization'] ?? null, body: route.request().postData() ?? '' });
      const sse =
        `data: ${JSON.stringify({ choices: [{ delta: { audio: { data: pcm, transcript: 'mupoz' } } }] })}\n\n` +
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
      await route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse });
    });
    await browserstimmeMitschreiben(page);
    await start(page, { regal: ['frei'], liveStimme: 'openrouter', openrouterSchluessel: 'test-schluessel', lautRuftTier: false });
    await oeffne(page, 'frei');
    for (const z of ['m', 'u', 'p', 'o', 'z']) await page.getByTestId(`taste-${z}`).click();
    await page.getByTestId('vorlesen').click();
    await expect.poll(() => anfragen.length).toBe(1);
    expect(anfragen[0]!.auth).toBe('Bearer test-schluessel');
    expect(anfragen[0]!.body).toContain('gpt-audio-mini');
    expect(anfragen[0]!.body).toContain('mupoz');
    await page.waitForTimeout(800);
    await page.getByTestId('vorlesen').click();
    await page.waitForTimeout(1500);
    expect(anfragen.length).toBe(1); // zweites Mal aus dem Cache
    expect(await gesprochen(page)).toEqual([]);
  });

  test('Live-Stimme umschaltbar, Elternhinweis zu Kosten und Datenfluss', async ({ page }) => {
    await start(page);
    await page.getByTestId('einstellungen').click();
    const live = page.getByTestId('einstellung-livestimme');
    for (const w of ['browser', 'piper', 'openrouter']) await expect(live.locator(`option[value="${w}"]`)).toHaveCount(1);
    await live.selectOption('openrouter');
    await page.reload();
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('einstellung-livestimme')).toHaveValue('openrouter');
    await expect(page.getByTestId('openrouter-hinweis')).toContainText('kostet');
  });

  test('Spracheingabe nur, wenn Eltern sie einschalten', async ({ page }) => {
    await start(page, { regal: ['frei'] });
    await oeffne(page, 'frei');
    await expect(page.getByTestId('spracheingabe')).toHaveCount(0);
    await page.goto('/');
    await page.getByTestId('einstellungen').click();
    const e = page.getByTestId('einstellung-spracheingabe');
    for (const w of ['aus', 'browser', 'openrouter']) await expect(e.locator(`option[value="${w}"]`)).toHaveCount(1);
  });

  test('Offline-Stimme wird nicht vorab geladen (nicht im Start-Bundle, nicht im Precache)', async ({ page, request }) => {
    const geladen: string[] = [];
    page.on('request', (r) => geladen.push(r.url()));
    await start(page);
    await page.waitForTimeout(1000);
    expect(geladen.filter((u) => /\.onnx|piper|onnxruntime/i.test(u))).toEqual([]);
    const sw = await request.get('sw.js');
    expect(sw.ok()).toBe(true);
    expect(await sw.text()).not.toMatch(/\.onnx|onnxruntime|piper/i);
  });
});

test.describe('Querformat', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('Start: kein horizontales Scrollen, Regal sichtbar', async ({ page }) => {
    await start(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
    await expect(page.getByTestId('modus-frei')).toBeVisible();
  });

  test('Tier-Modus: Bild links, Wort und Tasten rechts', async ({ page }) => {
    await mitPaket(page, ['tiere']);
    await oeffne(page, 'tiere');
    await page.getByTestId('tier-wahl-hase').dblclick();
    const bild = (await page.getByTestId('tier-bild').boundingBox())!;
    const wort = (await page.getByTestId('zielwort').boundingBox())!;
    expect(bild.x + bild.width).toBeLessThanOrEqual(wort.x + 4);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
    const taste = (await page.getByTestId('taste-h').boundingBox())!;
    expect(taste.y + taste.height).toBeLessThanOrEqual(390);
  });

  test('Nachfüllen: Wort und Tasten ohne Scrollen sichtbar', async ({ page }) => {
    await start(page);
    await oeffne(page, 'nachfuellen');
    const wort = (await page.getByTestId('zielwort').getAttribute('data-wort'))!;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(844);
    const taste = (await page.getByTestId(`taste-${Array.from(wort)[0]}`).first().boundingBox())!;
    expect(taste.y + taste.height).toBeLessThanOrEqual(390);
  });

  test('Regal und Silben ohne vertikales Scrollen', async ({ page }) => {
    const ohneScrollen = async () =>
      expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - window.innerHeight)).toBeLessThanOrEqual(1);
    await mitPaket(page, ['tiere', 'frei', 'nachfuellen', 'silben']);
    for (const id of ['tiere', 'frei', 'nachfuellen', 'silben']) await expect(page.getByTestId(`modus-${id}`).first()).toBeInViewport({ ratio: 1 });
    await ohneScrollen();
    await oeffne(page, 'silben');
    await expect(page.getByTestId('tier-wahl-hase')).toBeVisible();
    await ohneScrollen();
    await page.getByTestId('tier-wahl-hase').dblclick();
    await expect(page.getByTestId('silbe-1')).toBeVisible();
    await ohneScrollen();
    await page.getByTestId('silbe-0').click();
    await page.getByTestId('silbe-1').click();
    await expect(page.getByTestId('silben-fertig')).toBeVisible({ timeout: 10_000 });
    await ohneScrollen();
  });
});
