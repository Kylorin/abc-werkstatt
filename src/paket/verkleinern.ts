/**
 * B15: Paketbilder beim Import auf höchstens ≈ 512 px verkleinern (webp, wo der Browser es kodiert).
 * So dekodieren Wiese und Freude schnell, und das Paket braucht weniger Gerätespeicher.
 * SVG bleibt unverändert (Vektor). Kleinere Rasterbilder bleiben, wie sie sind.
 */
import { PaketFehler } from '../kern/vertrag';

export const BILD_MAX_PX = 512;
const QUALITAET = 0.85;

/** Verkleinert ein Rasterbild, wenn eine Seite größer als `BILD_MAX_PX` ist. Wirft `PaketFehler`, wenn es sich nicht öffnen lässt. */
export async function verkleinereBild(pfad: string, blob: Blob): Promise<Blob> {
  if (blob.type === 'image/svg+xml') return blob;
  let bild: ImageBitmap;
  try {
    bild = await createImageBitmap(blob);
  } catch (e) {
    throw new PaketFehler(`Das Bild „${pfad}“ lässt sich nicht öffnen (beschädigt oder unbekanntes Format).`, { cause: e });
  }
  try {
    const seite = Math.max(bild.width, bild.height);
    if (seite <= BILD_MAX_PX) return blob;
    const faktor = BILD_MAX_PX / seite;
    const breite = Math.max(1, Math.round(bild.width * faktor));
    const hoehe = Math.max(1, Math.round(bild.height * faktor));
    const leinwand = new OffscreenCanvas(breite, hoehe);
    const g = leinwand.getContext('2d');
    if (!g) throw new PaketFehler(`Das Bild „${pfad}“ konnte nicht verkleinert werden (kein Zeichenkontext).`);
    g.imageSmoothingQuality = 'high';
    g.drawImage(bild, 0, 0, breite, hoehe);
    // Safari kodiert kein webp und liefert dann png — kleiner als das Original ist es trotzdem.
    return await leinwand.convertToBlob({ type: 'image/webp', quality: QUALITAET });
  } finally {
    bild.close();
  }
}
