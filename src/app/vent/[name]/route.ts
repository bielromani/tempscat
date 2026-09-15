import { blob } from '@/lib/cache-store';
import { WIND_DIR } from '@/lib/wind';

/**
 * Serveix les graelles de vent que `forecast-field.ts` ja ha calculat.
 *
 * ## Això no és una imatge: és una taula de números
 *
 * El vermell de cada píxel porta la component cap a l'est i el verd la
 * component cap al nord. Va en PNG perquè és **sense pèrdua** i perquè una
 * textura de WebGL es fa amb una imatge sense descodificar res pel mig; en
 * WebP amb pèrdua els bytes deixarien de ser números i el vent sortiria
 * lleugerament equivocat a tot arreu, cosa que no es veuria mai.
 *
 * Són uns tres quilobytes per hora: 69 × 51 caselles.
 *
 * ## El nom es valida abans de tocar res
 *
 * És un segment d'URL que acaba concatenat en una ruta de l'emmagatzematge, i
 * sense validar-lo un `..%2f` llegeix el que no ha de llegir. El format és
 * exactament `AAAAMMDDHH.png`, com el del camp de pluja.
 *
 * ## I caduca d'aquí a un any
 *
 * Una hora concreta no canvia de contingut: el vent previst per a les set de
 * la tarda d'avui es torna a calcular amb el nom de la seva hora i el fitxer
 * nou substitueix el vell. Quines hores hi ha, en canvi, sí que caduca, i això
 * és l'índex, que va per una altra banda.
 */

const NAME_RE = /^\d{10}\.png$/;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  if (!NAME_RE.test(name)) return new Response('Not found', { status: 404 });

  const bytes = await blob(`${WIND_DIR}/${name}`);
  if (!bytes) return new Response('Not found', { status: 404 });

  return new Response(bytes.buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
