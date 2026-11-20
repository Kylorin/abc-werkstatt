/**
 * Registrierung aller Modi (Fundament). Jeder Bau exportiert aus seinem
 * src/modi/<ordner>/index.ts genau `export const modus: Modus` — diese Datei muss dafür niemand
 * anfassen (alle Ordner sind schon eingetragen). Die Reihenfolge hier ist egal; das Regal ordnet
 * nach `einstellungen.regal`.
 */
import type { Modus } from '../kern/vertrag';
import { modus as frei } from './frei';
import { modus as nachfuellen } from './nachfuellen';
import { modus as tiere } from './tiere';
import { modus as lautRuftTier } from './laut-ruft-tier';
import { modus as decke } from './decke';
import { modus as silben } from './silben';
import { modus as geschichten } from './geschichten';
import { modus as leute } from './leute';
import { modus as woerterbuch } from './woerterbuch';
import { modus as einstellungen } from './einstellungen';
import { modus as lautStudio } from './laut-studio';

export const MODI: readonly Modus[] = [
  frei, nachfuellen, tiere, lautRuftTier, decke, silben, geschichten, leute, woerterbuch, einstellungen, lautStudio,
];
