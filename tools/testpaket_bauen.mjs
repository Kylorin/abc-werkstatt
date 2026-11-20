// Baut tests/fixtures/testpaket.zip – das Test-Tier-Paket „Testtiere" (Igel, Maus, Hase, Schaf)
// mit selbst gezeichneten SVG-Bildern. Format: docs/tier-paket.md (inkl. der optionalen Felder F0).
// - Igel, Maus, Hase: Einzel-Anlaut, Silben, Bewegung, Rätsel; die Maus hat eine Situation (Helfer: Hase).
// - Schaf: Phonogramm-Anlaut „sch“ — darf in keinem Anlaut-Spiel auftauchen (auch nicht unter „s“).
// - Audio nur beim Hasen (Name, Silben, Freude) als stille Mini-mp3; alle anderen Tiere sind ohne
//   Audio, damit jedes Feature zeigen muss, dass es auch ohne geht.
// Aufruf: npm run testpaket   (Ergebnis wird committet)
import { zipSync, strToU8 } from 'fflate';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ziel = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'testpaket.zip');

const rahmen = (inhalt) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect width="200" height="200" rx="24" fill="#f8eedd"/>${inhalt}</svg>`;

const BILDER = {
  'bilder/igel.svg': rahmen(
    '<path d="M40 130c0-40 30-65 70-65 32 0 52 22 56 50l14 8-16 10c-6 10-20 17-40 17H50c-6 0-10-6-10-20z" fill="#8a6a4f"/>' +
      '<path d="M55 95l-12-14M75 78l-6-18M98 70l2-19M120 72l10-16M140 82l15-12" stroke="#5b4332" stroke-width="7" stroke-linecap="round"/>' +
      '<circle cx="150" cy="112" r="5" fill="#2b2723"/><circle cx="181" cy="124" r="5" fill="#2b2723"/>' +
      '<path d="M70 150v14M120 150v14" stroke="#5b4332" stroke-width="9" stroke-linecap="round"/>',
  ),
  'bilder/maus.svg': rahmen(
    '<ellipse cx="100" cy="125" rx="58" ry="40" fill="#a9a29a"/><circle cx="62" cy="80" r="22" fill="#c9c2ba"/><circle cx="62" cy="80" r="12" fill="#e9b7b2"/>' +
      '<circle cx="138" cy="80" r="22" fill="#c9c2ba"/><circle cx="138" cy="80" r="12" fill="#e9b7b2"/>' +
      '<circle cx="85" cy="115" r="5" fill="#2b2723"/><circle cx="115" cy="115" r="5" fill="#2b2723"/><circle cx="100" cy="132" r="6" fill="#d9646e"/>' +
      '<path d="M158 140c22 4 30 18 22 30" fill="none" stroke="#a9a29a" stroke-width="6" stroke-linecap="round"/>',
  ),
  'bilder/hase.svg': rahmen(
    '<ellipse cx="80" cy="60" rx="14" ry="40" fill="#e3d6c5"/><ellipse cx="120" cy="60" rx="14" ry="40" fill="#e3d6c5"/>' +
      '<ellipse cx="80" cy="62" rx="6" ry="28" fill="#e9b7b2"/><ellipse cx="120" cy="62" rx="6" ry="28" fill="#e9b7b2"/>' +
      '<circle cx="100" cy="125" r="50" fill="#e3d6c5"/><circle cx="82" cy="118" r="5" fill="#2b2723"/><circle cx="118" cy="118" r="5" fill="#2b2723"/>' +
      '<path d="M94 136l6 5 6-5" fill="none" stroke="#d9646e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  ),
  'bilder/schaf.svg': rahmen(
    '<circle cx="70" cy="110" r="26" fill="#f4efe6"/><circle cx="100" cy="96" r="30" fill="#f4efe6"/><circle cx="130" cy="110" r="26" fill="#f4efe6"/>' +
      '<circle cx="100" cy="128" r="30" fill="#f4efe6"/><ellipse cx="150" cy="96" rx="18" ry="22" fill="#4a4440"/>' +
      '<circle cx="146" cy="92" r="3.5" fill="#fffdf9"/><path d="M80 152v18M120 152v18" stroke="#4a4440" stroke-width="8" stroke-linecap="round"/>',
  ),
  'cover.svg': rahmen(
    '<circle cx="62" cy="120" r="34" fill="#8a6a4f"/><circle cx="100" cy="90" r="30" fill="#a9a29a"/><circle cx="140" cy="122" r="34" fill="#e3d6c5"/>' +
      '<path d="M30 160h140" stroke="#4d7c5f" stroke-width="8" stroke-linecap="round"/>',
  ),
};

const paket = {
  format: 'abc-werkstatt-tierpaket/1',
  id: 'testtiere',
  titel: 'Testtiere',
  untertitel: 'Vier Tiere zum Ausprobieren',
  cover: 'cover.svg',
  sprache: 'de-DE',
  tiere: [
    {
      id: 'igel', name: 'Igel', artikel: 'der', bild: 'bilder/igel.svg',
      kann: 'Der Igel kann sich ganz rund machen.', freude: 'Juhu, du hast Igel geschrieben!',
      anlaut: 'i', silben: ['i', 'gel'], bewegung: 'rollt', raetsel: ['Ich habe Stacheln.', 'Ich rolle mich ganz rund.'],
    },
    {
      id: 'maus', name: 'Maus', artikel: 'die', bild: 'bilder/maus.svg',
      kann: 'Die Maus kann ganz leise trippeln.', freude: 'Piep, das bin ich!',
      anlaut: 'm', silben: ['maus'], bewegung: 'kriecht', raetsel: ['Ich piepse ganz leise.'],
      situationen: [
        {
          id: 'maus-regal',
          problem: 'Die Maus möchte an den Apfel oben im Regal. Sie ist zu klein.',
          helfer: 'hase',
          loesung: 'Der Hase hüpft hoch und holt den Apfel herunter.',
        },
      ],
    },
    {
      id: 'hase', name: 'Hase', artikel: 'der', bild: 'bilder/hase.svg',
      kann: 'Der Hase kann weit hoppeln.', freude: 'Hopp, hopp, wie schön!',
      anlaut: 'h', silben: ['ha', 'se'], bewegung: 'huepft', raetsel: ['Ich habe lange Ohren.'],
      audio: {
        name: 'audio/hase-name.mp3',
        silben: ['audio/hase-silbe-1.mp3', 'audio/hase-silbe-2.mp3'],
        freude: ['audio/hase-freude-1.mp3', 'audio/hase-freude-2.mp3'],
      },
    },
    {
      id: 'schaf', name: 'Schaf', artikel: 'das', bild: 'bilder/schaf.svg',
      kann: 'Das Schaf kann laut rufen.', anlaut: 'sch', silben: ['schaf'], bewegung: 'stampft',
      raetsel: ['Ich habe weiche Wolle.'],
    },
  ],
};

/**
 * Stille Mini-mp3 (MPEG-1 Layer III, 128 kbit/s, 44,1 kHz, mono): `frames` leere Rahmen à 417 Bytes,
 * je ≈ 26 ms. Seitensinfo und Hauptdaten sind 0 → Stille. Reicht, damit Paket-Audio ohne echte Stimme abspielbar ist.
 */
function stilleMp3(frames) {
  const rahmen = new Uint8Array(417);
  rahmen.set([0xff, 0xfb, 0x90, 0xc0]);
  const aus = new Uint8Array(417 * frames);
  for (let i = 0; i < frames; i++) aus.set(rahmen, i * 417);
  return aus;
}

const dateien = { 'paket.json': strToU8(JSON.stringify(paket, null, 2)) };
for (const [pfad, svg] of Object.entries(BILDER)) dateien[pfad] = strToU8(svg);
for (const t of paket.tiere) {
  const a = t.audio ?? {};
  for (const pfad of [a.name, ...(a.silben ?? []), ...(a.freude ?? [])].filter(Boolean)) dateien[pfad] = stilleMp3(12);
}

// Feste Zeitstempel, damit das Zip bei gleichem Inhalt byte-gleich bleibt.
const zip = zipSync(dateien, { level: 9, mtime: new Date('2026-01-01T00:00:00Z') });
mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, zip);
console.log(`geschrieben: tests/fixtures/testpaket.zip (${zip.length} Bytes, ${paket.tiere.length} Tiere)`);
