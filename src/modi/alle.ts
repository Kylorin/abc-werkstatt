/**
 * Registrierung aller Modi (Fundament). Jeder Bau exportiert aus seinem
 * src/modi/<ordner>/index.ts genau `export const modus: Modus` — diese Datei
 * muss dafür niemand anfassen. Die Reihenfolge hier ist egal; den Start ordnet kern/start.ts.
 */
import type { Modus } from '../kern/vertrag';
import { modus as frei } from './frei';
import { modus as nachfuellen } from './nachfuellen';
import { modus as tiere } from './tiere';
import { modus as woerterbuch } from './woerterbuch';
import { modus as einstellungen } from './einstellungen';
import { modus as lautStudio } from './laut-studio';

export const MODI: readonly Modus[] = [frei, nachfuellen, tiere, woerterbuch, einstellungen, lautStudio];
