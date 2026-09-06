import { blob } from '@/lib/cache-store';

/**
 * Serveix les tessel·les del mapa base que `scripts/14-basemap-tiles.ts` ja ha
 * desat i reescrit en WebP.
 *
 * No és un proxy. Si el fitxer no hi és, torna 404 i no surt a buscar-lo a
 * l'ICGC: cap petició d'un lector no dispara mai una crida a un tercer, i és el
 * primer principi del projecte.
 *
 * ## Els tres paràmetres es validen abans de tocar res
 *
 * Són tres segments d'URL que acaben concatenats en una ruta de
 * l'emmagatzematge, i sense validar-los un `..%2f` llegeix el que no ha de
 * llegir. Al zoom se li comprova que sigui un dels que existeixen: amb `\d+`
 * n'hi hauria prou per a la seguretat, però no per adonar-se el dia que la
 * pàgina en demani un que no s'ha calculat.
 *
 * ## Caduca d'aquí a un any
 *
 * Un mapa base canvia poc i, quan canviï, la manera de refrescar-lo és tornar a
 * córrer el worker i buidar el CDN — no fer que cada lector pregunti cada dia.
 */

const Z_RE = /^(9|1[0-4])$/;
const X_RE = /^\d{1,5}$/;
const Y_RE = /^\d{1,5}\.webp$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ z: string; x: string; y: string }> },
) {
  const { z, x, y } = await params;
  if (!Z_RE.test(z) || !X_RE.test(x) || !Y_RE.test(y)) {
    return new Response('Not found', { status: 404 });
  }

  const bytes = await blob(`base/${z}/${x}/${y}`);
  if (!bytes) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
