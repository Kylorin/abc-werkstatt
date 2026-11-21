/**
 * Die Patchwork-Decke als SVG — gemeinsam für „Wer ist unter der Decke?“ (F3) und die Gute Nacht (B9).
 *
 * Eine weiche, gesteppte Decke: abgerundete Form mit welligem Saum, Flicken in den Deckenfarben
 * (einige mit Pünktchen oder Streifen), Naht-Stiche entlang der Flicken und der Einfassung,
 * Licht oben, Schatten unten und darunter auf dem Boden.
 *
 * - `beule`: die Decke wölbt sich in der Mitte über etwas — es liegt jemand darunter. Die Gruppe
 *   `.stoff__wiege` atmet/wackelt per CSS (decke.css), die Form selbst bleibt ein Pfad.
 * - `flach`: Bettdecke für die Gute Nacht. Sie wird mit `preserveAspectRatio="none"` auf jede
 *   Fläche gezogen; darum nur Flicken, Streifen und Stiche (keine Pünktchen, die zu Eiern würden),
 *   und alle Linien mit `vector-effect: non-scaling-stroke`.
 *
 * Farben kommen aus den Tokens (`--decke-1/2/3`, `--decke-naht`), gesetzt über Klassen in decke.css.
 */
import './stoff.css';

let zaehler = 0;

/** Welliger Saum von rechts (`x1`) nach links (`x0`) auf Höhe `y`, `n` weiche Bögen nach unten. */
function saum(x1: number, x0: number, y: number, n: number, tiefe: number): string {
  const b = (x1 - x0) / n;
  let d = '';
  for (let i = 0; i < n; i++) {
    const xa = x1 - b * i;
    const xb = xa - b;
    d += ` Q ${(xa + xb) / 2} ${y + tiefe} ${xb} ${y}`;
  }
  return d;
}

/** Welliger Rand von links nach rechts auf Höhe `y` (Bögen abwechselnd leicht hoch und runter). */
function oberkante(x0: number, x1: number, y: number, n: number, hub: number): string {
  const b = (x1 - x0) / n;
  let d = '';
  for (let i = 0; i < n; i++) {
    const xa = x0 + b * i;
    const xb = xa + b;
    d += ` Q ${(xa + xb) / 2} ${y + (i % 2 ? hub : -hub)} ${xb} ${y}`;
  }
  return d;
}

interface Form {
  breite: number;
  hoehe: number;
  umriss: string;
  spalten: number[];
  reihen: number[];
  /** Mitte für Licht und Einfassungs-Stich. */
  mitte: [number, number];
}

const BEULE: Form = {
  breite: 320,
  hoehe: 236,
  umriss:
    'M 14 206 C 4 168 10 128 46 116 C 80 106 100 102 114 78 C 128 46 146 32 162 32 C 180 32 198 46 210 78 ' +
    'C 222 104 244 108 276 116 C 310 128 318 168 306 206' +
    saum(306, 14, 206, 8, 14) +
    ' Z',
  spalten: [0, 72, 126, 196, 252, 320],
  reihen: [0, 86, 150, 236],
  mitte: [160, 132],
};

const FLACH: Form = {
  breite: 320,
  hoehe: 200,
  umriss: 'M 8 46 C 8 24 20 14 42 14' + oberkante(42, 278, 14, 6, 5) + ' C 300 14 312 24 312 46 L 314 170' + saum(314, 6, 170, 9, 14) + ' L 8 46 Z',
  spalten: [0, 58, 112, 168, 216, 266, 320],
  reihen: [0, 50, 110, 200],
  mitte: [160, 100],
};

/** Füllung je Flicken: Farbklasse und ggf. Muster (Pünktchen nur bei der Beulen-Decke). */
const FLICKEN: readonly (readonly [string, 'punkte' | 'streifen' | 'karo' | ''])[] = [
  ['f1', ''],
  ['f3', 'streifen'],
  ['f2', ''],
  ['f4', 'punkte'],
  ['f5', ''],
  ['f6', 'karo'],
  ['f2', 'punkte'],
  ['f1', ''],
  ['f5', 'streifen'],
  ['f3', ''],
  ['f4', ''],
  ['f6', 'punkte'],
];

export interface StoffOptionen {
  form: 'beule' | 'flach';
}

/** SVG-Markup der Decke (aria-hidden, rein dekorativ). */
export function deckeSvg(o: StoffOptionen): string {
  const id = `stoff${++zaehler}`;
  const flach = o.form === 'flach';
  const f = flach ? FLACH : BEULE;
  const ns = flach ? ' vector-effect="non-scaling-stroke"' : '';

  const flicken: string[] = [];
  let k = 0;
  for (let r = 0; r < f.reihen.length - 1; r++) {
    for (let s = 0; s < f.spalten.length - 1; s++) {
      const [farbe, muster] = FLICKEN[(k++ + r * 2) % FLICKEN.length] as readonly [string, string];
      const x = f.spalten[s] as number;
      const y = f.reihen[r] as number;
      const w = (f.spalten[s + 1] as number) - x;
      const h = (f.reihen[r + 1] as number) - y;
      flicken.push(`<rect class="stoff__${farbe}" x="${x}" y="${y}" width="${w}" height="${h}"/>`);
      const m = flach && muster === 'punkte' ? 'streifen' : muster;
      if (m) flicken.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${id}-${m})"/>`);
    }
  }

  // Nähte zwischen den Flicken: eine leichte Rille, darüber die hellen Stiche.
  const naehte: string[] = [];
  for (const x of f.spalten.slice(1, -1)) naehte.push(`M ${x} 0 V ${f.hoehe}`);
  for (const y of f.reihen.slice(1, -1)) naehte.push(`M 0 ${y} H ${f.breite}`);
  const naht = naehte.join(' ');

  const [mx, my] = f.mitte;
  const innen = `translate(${mx} ${my}) scale(0.92 0.9) translate(${-mx} ${-my})`;
  const licht = flach
    ? ''
    : `<ellipse cx="160" cy="70" rx="70" ry="44" fill="url(#${id}-glanz)"/>`;

  return `<svg class="stoff stoff--${o.form}" viewBox="0 0 ${f.breite} ${f.hoehe}" preserveAspectRatio="${flach ? 'none' : 'xMidYMax meet'}" focusable="false" aria-hidden="true">
<defs>
  <clipPath id="${id}-form"><path d="${f.umriss}"/></clipPath>
  <pattern id="${id}-punkte" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.2" class="stoff__muster"/><circle cx="11" cy="11" r="2.2" class="stoff__muster"/></pattern>
  <pattern id="${id}-streifen" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="4.5" height="12" class="stoff__muster"/></pattern>
  <pattern id="${id}-karo" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="8" height="8" class="stoff__muster"/><rect x="8" y="8" width="8" height="8" class="stoff__muster"/></pattern>
  <linearGradient id="${id}-licht" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0.26"/>
    <stop offset="0.42" stop-color="#fff" stop-opacity="0"/>
    <stop offset="0.78" stop-color="#2b2723" stop-opacity="0.06"/>
    <stop offset="1" stop-color="#2b2723" stop-opacity="0.24"/>
  </linearGradient>
  <radialGradient id="${id}-glanz"><stop offset="0" stop-color="#fff" stop-opacity="0.34"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}-boden"><stop offset="0" stop-color="#2b2723" stop-opacity="0.26"/><stop offset="1" stop-color="#2b2723" stop-opacity="0"/></radialGradient>
</defs>
${flach ? '' : `<ellipse class="stoff__boden" cx="160" cy="214" rx="162" ry="20" fill="url(#${id}-boden)"/>`}
<g class="stoff__wiege">
  <g clip-path="url(#${id}-form)">
    ${flicken.join('')}
    <path d="${naht}" class="stoff__rille"${ns}/>
    <path d="${naht}" class="stoff__stich"${ns}/>
    <rect width="${f.breite}" height="${f.hoehe}" fill="url(#${id}-licht)"/>
    ${licht}
    <path d="${f.umriss}" transform="${innen}" class="stoff__stich stoff__stich--rand"${ns}/>
  </g>
  <path d="${f.umriss}" class="stoff__kante"${ns}/>
</g>
</svg>`;
}

/** Die Decke als dekoratives Element (span mit SVG). */
export function erzeugeDeckenStoff(o: StoffOptionen & { klasse?: string }): HTMLElement {
  const s = document.createElement('span');
  s.className = ['decken-stoff', o.klasse ?? ''].filter(Boolean).join(' ');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = deckeSvg(o);
  return s;
}
