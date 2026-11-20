/**
 * Platzhalter für Arbeiten, deren Bau noch aussteht (Fundament). Jeder Bau ersetzt den Inhalt
 * seines src/modi/<ordner>/index.ts durch den echten Modus — Id, Titel und Icon bleiben.
 */
import { el } from '../kern/dom';
import type { IconName } from '../kern/ui/icons';
import type { Modus, ModusId } from '../kern/vertrag';

export function baustelle(id: ModusId, titel: string, icon: IconName): Modus {
  return {
    id,
    titel,
    icon,
    mount(flaeche) {
      flaeche.append(el('p', { klasse: 'hinweis', testid: 'baustelle', text: 'Diese Arbeit kommt bald.' }));
    },
    unmount() {
      /* nichts aufzuräumen */
    },
  };
}
