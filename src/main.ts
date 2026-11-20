/** Einstieg der ABC-Werkstatt (Fundament): Dienste erzeugen, Router starten, Service Worker registrieren. */
import './kern/stil/index.css';
import { registerSW } from 'virtual:pwa-register';
import { erzeugeEinstellungen } from './kern/einstellungen';
import { erzeugeWoerter } from './kern/woerter';
import { ROUTE_GEWECHSELT, starteRouter } from './kern/router';
import { erzeugeAudioDienst } from './audio';
import { erzeugePaketDienst } from './paket';
import { MODI } from './modi/alle';

const wurzel = document.getElementById('app');
if (!wurzel) throw new Error('#app fehlt in index.html');

const einstellungen = erzeugeEinstellungen();
const audio = erzeugeAudioDienst(einstellungen);
const pakete = erzeugePaketDienst();
const woerter = erzeugeWoerter();

const router = starteRouter(wurzel, { audio, pakete, woerter, einstellungen }, MODI);
audio.vorab().catch((f: unknown) => console.error('Audio-Vorab fehlgeschlagen', f));

// Langes Drücken in den Kinder-Bereichen öffnet kein Kontextmenü (Bild sichern/teilen).
const KINDER_BEREICH = ".start, .rahmen[data-modus='frei'], .rahmen[data-modus='nachfuellen'], .rahmen[data-modus='tiere']";
document.addEventListener('contextmenu', (ev) => {
  if (ev.target instanceof Element && ev.target.closest(KINDER_BEREICH)) ev.preventDefault();
});

// Neue Version nach einem Deploy: nie mitten in der Arbeit neu laden (das Kind landete sonst
// ungefragt auf dem Start, eine Elternaufnahme bräche ab). Erst, wenn die App auf dem Start
// steht oder in den Hintergrund geht.
let neueVersionBereit = false;
function ladeNeuWennRuhig(): void {
  if (!neueVersionBereit) return;
  if (document.visibilityState === 'hidden' || router.aktuell().ziel === 'start') location.reload();
}
document.addEventListener('visibilitychange', ladeNeuWennRuhig);
window.addEventListener(ROUTE_GEWECHSELT, ladeNeuWennRuhig);

registerSW({
  immediate: true,
  onNeedReload() {
    neueVersionBereit = true;
    ladeNeuWennRuhig();
  },
});
