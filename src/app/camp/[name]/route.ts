import { blob } from '@/lib/cache-store';
import { FIELD_DIR } from '@/lib/field';

/**
 * Serveix les imatges del camp de pluja que `forecast-field.ts` ja ha pintat.
 *
 * No és cap proxy ni calcula res: si el fitxer no hi és, 404. Cap petició d'un
 * lector no dispara mai una crida a un tercer ni cap càlcul, que és el primer
 * principi del projecte.
 *
 * ## El nom es valida abans de tocar res
 *
 * És un segment d'URL que acaba concatenat en una ruta de l'emmagatzematge, i
 * sense validar-lo un `..%2f` llegeix el que no ha de llegir. El format és
 * exactament `AAAAMMDDHH.webp` i no `\d+`: així, el dia que la pàgina en demani
 * un amb una altra forma, se sap de seguida en comptes de rebre un 404 mut.
 *
 * ## I caduca d'aquí a un any
 *
 * Una hora concreta no canvia mai de contingut: la predicció per a les set de
 * la tarda d'avui es torna a pintar amb el nom de la seva hora i el fitxer nou
 * substitueix el vell a l'emmagatzematge. Com que el nom porta l'instant a
 * dins, el que ja s'ha servit segueix sent vàlid mentre existeixi.
 *
 * L'única cosa que sí que caduca és **quines hores hi ha**, i això és l'índex,
 * que va per una altra banda i el llegeix la pàgina amb la seva revalidació.
 */

const NAME_RE = /^\d{10}\.webp$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!NAME_RE.test(name)) return new Response('Not found', { status: 404 });

  const bytes = await blob(`${FIELD_DIR}/${name}`);
  if (!bytes) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
