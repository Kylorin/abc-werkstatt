// Abnahmetests der ABC-Werkstatt — RICHTER-DATEI, nachts schreibgeschützt.
// Vertrag über data-testid. Die App darf intern beliebig gebaut sein, solange diese Tests grün sind.
import { test, expect, Page } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  test('kein Kindername und kein Schlüssel im Code', () => {
    // Name zusammengesetzt, damit diese Datei sich nicht selbst meldet
    const verboten = new RegExp(['phil', 'eas'].join('') + '|Ocp-Apim-Subscription-Key:\\s*[0-9a-zA-Z]{20,}', 'i');
    const treffer: string[] = [];
    const lauf = (dir: string) => {
      for (const n of readdirSync(dir)) {
        if (['node_modules', '.git', 'dist', 'test-results', 'playwright-report'].includes(n)) continue;
        const p = join(dir, n);
        if (statSync(p).isDirectory()) lauf(p);
        else if (/\.(ts|js|mjs|html|css|json|md|py|sh|yml|webmanifest|svg)$/.test(n) && verboten.test(readFileSync(p, 'utf8'))) treffer.push(p);
      }
    };
    lauf(process.cwd());
    expect(treffer).toEqual([]);
  });
});
