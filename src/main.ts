/** Einstieg der ABC-Werkstatt (Fundament): Dienste erzeugen, Router starten, Service Worker registrieren. */
import './kern/stil/index.css';
import { registerSW } from 'virtual:pwa-register';
import { erzeugeEinstellungen } from './kern/einstellungen';
import { erzeugeWoerter } from './kern/woerter';
import { starteRouter } from './kern/router';
import { erzeugeAudioDienst } from './audio';
import { erzeugePaketDienst } from './paket';
import { MODI } from './modi/alle';

const wurzel = document.getElementById('app');
if (!wurzel) throw new Error('#app fehlt in index.html');

const einstellungen = erzeugeEinstellungen();
const audio = erzeugeAudioDienst(einstellungen);
const pakete = erzeugePaketDienst();
const woerter = erzeugeWoerter();

starteRouter(wurzel, { audio, pakete, woerter, einstellungen }, MODI);
audio.vorab().catch((f: unknown) => console.error('Audio-Vorab fehlgeschlagen', f));

registerSW({ immediate: true });
