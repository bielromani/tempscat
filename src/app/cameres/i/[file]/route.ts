import { blob } from '@/lib/cache-store';

/**
 * Sirve los fotogramas de cámara que el worker ya ha bajado y reescalado.
 *
 * Como la de las teselas de radar, **no es un proxy**: si el fichero no está en
 * el almacén devuelve 404 y no sale a buscarlo. Un proxy convertiría cada
 * visita en una petición a Roundshot o a `projecte4estacions`, que es
 * exactamente el principio que este proyecto no rompe — y encima mandaría allí
 * la IP del visitante.
 *
 * El nombre se valida contra una expresión regular estricta antes de construir
 * la ruta: es un segmento de URL que acaba concatenado, y sin validarlo un
 * `..%2f` lee lo que no debe.
 *
 * ## La caché, y por qué esta URL no es inmutable
 *
 * Las de radar sí lo son, porque cada marco tiene su instante en el nombre y su
 * contenido no puede cambiar nunca. Aquí el fichero es siempre `<id>.jpg` y se
 * sobrescribe cada hora: nombrar cada fotograma con su hora serían 3,6 GB
 * mensuales de objetos que nadie vuelve a mirar, contra un cupo de diez.
 *
 * Lo que cambia cuando cambia la foto es la **consulta** —`?v=<captura>`, que
 * pone `cameraImage()`—, y eso basta para que el CDN y el navegador guarden una
 * hora sin riesgo de servir la de antes: una URL nueva es una entrada nueva.
 * La `stale-while-revalidate` cubre la vuelta que se retrasa.
 */

const FILE_RE = /^\d{1,8}(-t)?\.jpg$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  if (!FILE_RE.test(file)) return new Response('Not found', { status: 404 });

  const bytes = await blob(`cameres/${file}`);
  if (!bytes) return new Response('Not found', { status: 404 });

  // El Uint8Array de la capa de almacén puede venir sobre un ArrayBufferLike
  // genérico, y Response no lo acepta sin más. Se le da el búfer.
  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
