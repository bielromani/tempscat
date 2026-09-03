import { fetchJson } from './http.ts';

/**
 * El portal de dades obertes de Ferrocarrils, i la seva trampa de paginació.
 *
 * **El `limit` de l'Explore v2.1 té el sostre a cent i no ho diu enlloc.**
 * `pistes-desqui` en té 181: torna un `200 OK` amb cent files i el
 * `total_count` posat a 181 en un racó de la resposta. Qui llegeixi `results` i
 * segueixi endavant es queda amb el 55 % del conjunt sense que res falli.
 *
 * I no és només qüestió de conjunts grans. El 3 de setembre de 2026 el catàleg
 * de càmeres —trenta files, que hi caben de sobra— va tornar una resposta curta
 * a mitja tarda: el worker va publicar **quinze càmeres de vint-i-quatre** i va
 * acabar en verd, amb la Molina sencera fora del web. Comparar el que arriba
 * amb el que el propi portal diu que hi ha és l'única manera de veure-ho.
 */

/** El sostre per pàgina de l'Explore v2.1. Més amunt no serveix de res. */
const PAGE = 100;

/**
 * Totes les files d'un conjunt, paginant i comprovant el recompte.
 *
 * **Llança si en falta alguna.** No retorna el que ha pogut llegir: per a
 * aquests workers, publicar un catàleg incomplet és pitjor que no publicar res,
 * perquè la instantània anterior —que era sencera— es queda servida i l'error
 * consta a `/estat`.
 */
export async function allRecords<T>(dataset: string, base: string): Promise<T[]> {
  const out: T[] = [];
  let total = Infinity;

  for (let offset = 0; out.length < total && offset < 5_000; offset += PAGE) {
    const url = `${base}/${dataset}/records?limit=${PAGE}&offset=${offset}`;
    const page = await fetchJson<{ total_count: number; results: T[] }>(
      url, { retries: 3, timeoutMs: 30_000 },
    );
    total = page.total_count ?? out.length;
    if (!page.results?.length) break;
    out.push(...page.results);
  }

  if (out.length < total) {
    throw new Error(
      `${dataset}: el portal diu que hi ha ${total} files i n'han arribat ${out.length}. `
      + 'No es publica un catàleg incomplet: la instantània anterior és millor.',
    );
  }
  return out;
}
