// Abnahmetests der ABC-Werkstatt — RICHTER-DATEI, nachts schreibgeschützt.
// Vertrag über data-testid. Die App darf intern beliebig gebaut sein, solange diese Tests grün sind.
import { test, expect, Page } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const LAUTE = 'abcdefghijklmnopqrstuvwxyzäöüß'.split('');
const VOKALE = new Set('aeiouäöü'.split(''));

async function start(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('start')).toBeVisible();
}

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
    await page.getByTestId('modus-frei').click();
    for (const b of LAUTE) {
      const taste = page.getByTestId(`taste-${b}`);
      await expect(taste).toBeVisible();
      await expect(taste).toHaveText(b);
      await expect(taste).toHaveAttribute('data-art', VOKALE.has(b) ? 'vokal' : 'konsonant');
    }
  });

  test('Antippen und echte Tastatur schreiben in den Text', async ({ page }) => {
    await start(page);
    await page.getByTestId('modus-frei').click();
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
    await page.getByTestId('modus-frei').click();
    const req = page.waitForRequest(r => /audio\/laute\/m(\.[a-z0-9]+)?\.mp3/.test(decodeURIComponent(r.url())));
    await page.getByTestId('taste-m').click();
    await req;
  });
});

test.describe('Nachfüllen', () => {
  test('richtig gefüllt, falsch abgewiesen, fertig gelobt, nächstes Wort kommt', async ({ page }) => {
    await start(page);
    await page.getByTestId('modus-nachfuellen').click();
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
    await page.getByTestId('modus-nachfuellen').click();
    const wort = (await page.getByTestId('zielwort').getAttribute('data-wort'))!;
    const gesprochen = page.waitForRequest(r => decodeURIComponent(r.url()).includes(`audio/woerter/`), { timeout: 10_000 });
    for (const z of Array.from(wort)) await page.getByTestId(`taste-${z}`).first().click();
    await gesprochen;
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
    await page.getByTestId('modus-nachfuellen').click();
    await expect(page.getByTestId('zielwort')).toHaveAttribute('data-wort', 'igel');

    await page.goto('/');
    await page.getByTestId('modus-woerterbuch').click();
    await page.getByTestId('wort-loeschen-igel').click();
    await expect(page.getByTestId('wortliste')).not.toContainText('igel');
  });
});

test.describe('Einstellungen', () => {
  test('Umschalter Buchstabennamen und Großbuchstaben, Feld für eigenen Azure-Schlüssel', async ({ page }) => {
    await start(page);
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('einstellung-namen')).toBeVisible();
    await expect(page.getByTestId('einstellung-gross')).toBeVisible();
    await expect(page.getByTestId('einstellung-azure-key')).toBeVisible();
    await page.getByTestId('einstellung-gross').click();
    await page.goto('/');
    await page.getByTestId('modus-frei').click();
    await expect(page.getByTestId('taste-m')).toHaveText('M');
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
    await page.getByTestId('modus-frei').click();
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
        if (['node_modules', '.git', 'dist', 'dev-dist', 'test-results', 'playwright-report', 'abnahme-ergebnis', '.lokal', '.wt'].includes(n)) continue;
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
  const TESTPAKET = join(process.cwd(), 'tests', 'fixtures', 'testpaket.zip');
  const TIERE = ['igel', 'maus', 'hase'];

  async function importiere(page: Page) {
    await start(page);
    await page.getByTestId('einstellungen').click();
    await page.getByTestId('paket-import').setInputFiles(TESTPAKET);
    await expect(page.getByTestId('paketliste')).toContainText('Testtiere', { timeout: 10_000 });
    await page.goto('/');
    await expect(page.getByTestId('modus-tiere')).toContainText('Testtiere');
  }

  test('Import: Paket erscheint in der Liste und als Kachel auf dem Start, bleibt nach Neuladen', async ({ page }) => {
    await importiere(page);
    await page.reload();
    await expect(page.getByTestId('start')).toBeVisible();
    await expect(page.getByTestId('modus-tiere')).toContainText('Testtiere');
    await page.getByTestId('einstellungen').click();
    await expect(page.getByTestId('paketliste')).toContainText('Testtiere');
  });

  test('Tiere schreiben: falsch wackelt, richtig geschafft, Tier freut sich, nächstes Tier kommt', async ({ page }) => {
    await importiere(page);
    await page.getByTestId('modus-tiere').first().click();
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
    await expect
      .poll(async () => ziel.getAttribute('data-wort'), { timeout: 10_000 })
      .not.toBe(wort);
  });

  test('Freies Schreiben erkennt Tiernamen', async ({ page }) => {
    await importiere(page);
    await page.getByTestId('modus-frei').click();
    for (const z of ['i', 'g', 'e', 'l']) await page.getByTestId(`taste-${z}`).click();
    await expect(page.getByTestId('tier-freude')).toBeVisible({ timeout: 10_000 });
  });

  test('Paket löschen: Kachel verschwindet vom Start', async ({ page }) => {
    await importiere(page);
    await page.getByTestId('einstellungen').click();
    await page.getByTestId('paket-loeschen-testtiere').click();
    await expect(page.getByTestId('paketliste')).not.toContainText('Testtiere');
    await page.goto('/');
    await expect(page.getByTestId('start')).toBeVisible();
    await expect(page.getByTestId('modus-tiere')).toHaveCount(0);
  });
});
