import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Serveix la geometria aprimada que `scripts/15-web-geometry.ts` deixa a
 * `data/build/geo/web/`.
 *
 * ## Per què una ruta i no dins de la pàgina
 *
 * Perquè el mapa obre amb el radar i **la capa de temperatura potser no
 * s'encén mai**. Posant els 144 kB dels municipis dins del HTML, els paga tothom
 * qui entra; darrere d'una adreça, només els paga qui els demana. És la mateixa
 * regla que parteix la predicció en 43 trossos: una pàgina baixa el que ensenya.
 *
 * ## Per què no van a `public/`
 *
 * Perquè `data/build/` ja es versiona i és d'on surt tota la resta del
 * territori. Tenir-ne una còpia a `public/` voldria dir dos fitxers que s'han
 * de recordar de canviar alhora, i el dia que no passés el mapa dibuixaria una
 * Catalunya i la pàgina en descriuria una altra.
 *
 * ## L'empremta va a l'`ETag` i no al nom
 *
 * La geometria de les comarques no canvia mai, però «mai» no és una política de
 * memòria cau. Amb l'empremta del contingut a l'`ETag`, un navegador que ja la
 * té pregunta i rep un 304 de zero bytes; i el dia que el Lluçanès torni a
 * moure una ratlla, la rep sencera sense que ningú hagi de recordar-se de
 * canviar cap número.
 */

/** Els dos fitxers que hi ha. Llista tancada: el nom ve de l'URL. */
const FILES = new Set(['comarques', 'municipis']);

/** Un cop llegit, es queda: el fitxer no canvia mentre el procés visqui. */
const memo = new Map<string, { body: Buffer; etag: string }>();

function load(name: string): { body: Buffer; etag: string } | null {
  const hit = memo.get(name);
  if (hit) return hit;

  try {
    const body = readFileSync(
      join(process.cwd(), 'data', 'build', 'geo', 'web', `${name}.json`),
    );
    const etag = `"${createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
    const entry = { body, etag };
    memo.set(name, entry);
    return entry;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!FILES.has(name)) return new Response('Not found', { status: 404 });

  const file = load(name);
  if (!file) return new Response('Not found', { status: 404 });

  if (req.headers.get('if-none-match') === file.etag) {
    return new Response(null, { status: 304, headers: { ETag: file.etag } });
  }

  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': 'application/geo+json; charset=utf-8',
      ETag: file.etag,
      /*
       * Un dia al navegador i una setmana de marge al CDN. No és `immutable`
       * perquè l'adreça no porta empremta: si ho fos, una correcció de frontera
       * es quedaria un any sense arribar a qui ja hi hagués passat.
       */
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
    },
  });
}
