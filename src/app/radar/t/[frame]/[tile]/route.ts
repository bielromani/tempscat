import { blob } from '@/lib/cache-store';

/**
 * Sirve las teselas de radar que el worker ya ha descargado.
 *
 * No es un proxy: si el fichero no está en disco devuelve 404 y no sale a
 * buscarlo. Un proxy convertiría cada visita en una petición a RainViewer, que
 * es exactamente el principio que este proyecto no rompe.
 *
 * Los dos parámetros se validan contra una expresión regular estricta antes de
 * construir la ruta. No es paranoia de manual: son dos segmentos de URL que
 * acaban concatenados, y sin validarlos un  ..%2f  lee lo que no debe — daba
 * igual cuando detrás había un  join()  contra el disco y sigue dando igual
 * ahora que detrás hay una URL del almacén.
 */

const FRAME_RE = /^\d{9,12}$/;
const TILE_RE = /^\d{1,2}_\d{1,6}_\d{1,6}\.png$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ frame: string; tile: string }> },
) {
  const { frame, tile } = await params;
  if (!FRAME_RE.test(frame) || !TILE_RE.test(tile)) {
    return new Response('Not found', { status: 404 });
  }

  const bytes = await blob(`radar/${frame}/${tile}`);
  if (!bytes) return new Response('Not found', { status: 404 });

  // El Uint8Array de la capa de almacén puede venir sobre un ArrayBufferLike
  // genérico, y Response no lo acepta sin más. Se le da el búfer.
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'image/png',
      /*
       * Inmutable, y con razón: una imagen de radar es la fotografía de un
       * instante que ya ha pasado. El contenido de esta URL no puede cambiar
       * nunca, así que el navegador no tiene por qué volver a preguntar. Los
       * marcos nuevos llegan con marcas de tiempo nuevas.
       */
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
