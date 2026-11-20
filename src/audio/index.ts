/**
 * STUB — Bau „audio" ersetzt diese Datei (Export `erzeugeAudioDienst` bleibt).
 * Vertrag: AudioDienst in src/kern/vertrag.ts.
 */
import { AudioFehler, type AudioDienst, type EinstellungenStore } from '../kern/vertrag';

export function erzeugeAudioDienst(_einstellungen: EinstellungenStore): AudioDienst {
  const still = async (): Promise<void> => {};
  return {
    vorab: still,
    laut: still,
    name: still,
    buchstabe: still,
    wort: still,
    satz: still,
    datei: still,
    stopp: () => {},
    lautVarianten: async () => [],
    aufnahmeStarten: async () => {
      throw new AudioFehler('Aufnahme ist noch nicht gebaut.');
    },
    aufnahmeSpeichern: async () => {
      throw new AudioFehler('Aufnahme ist noch nicht gebaut.');
    },
    aufnahmeLoeschen: still,
    hatAufnahme: async () => false,
  };
}
