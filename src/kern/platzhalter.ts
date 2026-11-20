/** Platzhalter-Modus, bis ein Bau seinen Modus liefert (Fundament). */
import { el } from './dom';
import type { IconName } from './ui/icons';
import type { Modus, ModusId } from './vertrag';

export function platzhalterModus(id: ModusId, titel: string, icon: IconName, zurueckZu?: ModusId | 'start'): Modus {
  return {
    id,
    titel,
    icon,
    zurueckZu,
    mount(flaeche) {
      flaeche.append(el('p', { klasse: 'hinweis', text: 'Dieser Bereich entsteht gerade.' }));
    },
    unmount() {},
  };
}
