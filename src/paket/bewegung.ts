/**
 * Bewegung je Tier (F4). Steht `bewegung` im Paket, gilt das Feld. Sonst wird die Bewegung aus der
 * Tierart abgeleitet: ein allgemeines Tierwort im Schreibwort („…vogel“, „…fisch“, „schnecke“).
 * Passt keines, hüpft das Tier wie bisher. Die Liste enthält nur allgemeine Tierarten.
 */
import { schreibwort } from '../kern/alphabet';
import type { Bewegung, Tier } from '../kern/vertrag';

/** Reihenfolge zählt: „fledermaus“ fliegt, „schwalbe“ fliegt (enthält „wal“), deshalb fliegen zuerst. */
const TIERARTEN: readonly (readonly [Bewegung, readonly string[]])[] = [
  ['fliegt', ['vogel', 'meise', 'spatz', 'amsel', 'eule', 'rabe', 'krähe', 'taube', 'adler', 'falke', 'biene', 'hummel', 'wespe', 'fliege', 'mücke', 'schmetterling', 'falter', 'libelle', 'fledermaus', 'papagei', 'storch', 'specht', 'möwe', 'schwalbe']],
  ['watschelt', ['ente', 'gans', 'pinguin', 'schwan']],
  ['schlaengelt', ['schlange', 'wurm', 'natter', 'aal']],
  ['schwimmt', ['fisch', 'wal', 'delfin', 'delphin', 'hai', 'robbe', 'seehund', 'qualle', 'krake', 'oktopus', 'forelle', 'karpfen', 'lachs', 'seepferd']],
  ['kriecht', ['schnecke', 'raupe', 'käfer', 'ameise', 'spinne', 'assel', 'krebs', 'krabbe', 'schildkröte']],
  ['klettert', ['affe', 'eichhörnchen', 'koala', 'faultier', 'katze']],
  ['stampft', ['elefant', 'bär', 'nashorn', 'nilpferd', 'büffel', 'stier', 'dino', 'saurier', 'mammut']],
  ['rollt', ['igel', 'gürteltier']],
];

/** Die Bewegung eines Tiers: Paketfeld, sonst aus der Tierart, sonst `huepft`. */
export function bewegungVon(tier: Pick<Tier, 'name' | 'bewegung'>): Bewegung {
  if (tier.bewegung) return tier.bewegung;
  const wort = schreibwort(tier.name);
  for (const [bewegung, woerter] of TIERARTEN) if (woerter.some((w) => wort.includes(w))) return bewegung;
  return 'huepft';
}
