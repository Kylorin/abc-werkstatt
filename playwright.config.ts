// RICHTER-DATEI — nachts schreibgeschützt. Testet den gebauten Stand (dist/) über `npm run preview`.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  retries: 1,
  reporter: [['list'], ['json', { outputFile: 'abnahme-ergebnis/ergebnis.json' }]],
  use: {
    baseURL: 'http://localhost:4173/abc-werkstatt/',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/abc-werkstatt/',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
