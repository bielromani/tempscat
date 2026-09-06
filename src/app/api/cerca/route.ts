import { MIN_QUERY, search } from '@/lib/search';

/**
 * Els suggeriments del cercador, mentre s'escriu.
 *
 *     /api/cerca?q=cala fos
 *
 * ## Per què n'hi ha d'haver un, si el formulari ja funcionava
 *
 * Perquè el formulari només contesta quan es prem Enter, i qui escriu «cadaq»
 * no sap encara si el lloc que busca hi és. Escriure a cegues i prémer per
 * comprovar-ho és el que fa que un cercador sembli buit.
 *
 * ## Per què és una ruta i no un índex al navegador
 *
 * L'índex són 4.293 poblacions més les platges, les estacions, els itineraris i
 * la resta: uns quants centenars de kB que caldria baixar **a totes les
 * pàgines** perquè el quadre viu a la capçalera. Una consulta són dos-cents
 * bytes de resposta i només la fa qui escriu.
 *
 * No dispara cap crida externa ni gasta cap quota: `search()` llegeix les
 * mateixes instantànies que les pàgines.
 *
 * ## `noindex`, i aquí de veritat
 *
 * El risc declarat del projecte és l'inflament de l'índex. Una ruta que torna
 * una llista diferent per a cada cadena de lletres és una fàbrica d'adreces:
 * no ha d'entrar-hi cap.
 */

export const revalidate = 3600;
export const dynamic = 'force-dynamic';

/** Els que caben en un desplegable sense tapar la pàgina. */
const LIMIT = 8;

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  /*
   * Es pot desar, i molt: el territori no canvia i les platges i les càmeres
   * que hi surten són noms, no mesures. El que caduca és el que hi ha darrere
   * de l'enllaç, no que l'enllaç existeixi.
   */
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  'X-Robots-Tag': 'noindex',
};

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get('q') ?? '';

  if (q.trim().length < MIN_QUERY) {
    return new Response(JSON.stringify({ hits: [], total: 0 }), { headers: HEADERS });
  }

  const { hits, total } = await search(q);

  return new Response(
    JSON.stringify({
      total,
      hits: hits.slice(0, LIMIT).map((h) => ({
        kind: h.kind, title: h.title, context: h.context ?? null, href: h.href,
      })),
    }),
    { headers: HEADERS },
  );
}
