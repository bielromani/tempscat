import type { MetadataRoute } from 'next';
import { allPublishedPaths, buildSummary, operativeStations } from '@/lib/territory';
import { IS_PRODUCTION, absolute } from '@/lib/site';

/**
 * Los sitemaps, partidos por tipo de página.
 *
 * ## Por qué partidos si caben en uno
 *
 * El límite son 50.000 URL por fichero y aquí hay 4.500: cabrían de sobra en
 * uno solo. Se parten igualmente **porque el riesgo declarado del proyecto es
 * el *index bloat***, y Search Console informa de cobertura por sitemap. Con
 * cuatro ficheros se ve por separado cuántas comarcas, cuántos municipios y
 * cuántos nuclis entran en el índice; con uno solo se ve un número que no dice
 * nada. La respuesta a «¿merece la pena publicar 3.300 nuclis?» sale de esa
 * separación y de ninguna otra parte.
 *
 * ## Sobre `lastModified`
 *
 * Se usa **la fecha de construcción del territorio**, no la del último dato.
 *
 * Es tentador poner la hora de la última observación, porque el contenido de
 * verdad cambia cada diez minutos. Pero decirle a un buscador que 4.293 páginas
 * se han modificado hace diez minutos, cada diez minutos, no consigue que las
 * rastree más: consigue que deje de creerse el campo. `lastModified` es para
 * cambios de contenido estructural —una ubicación nueva, un texto reescrito—, y
 * eso es exactamente lo que marca `builtAt`.
 *
 * ## `priority` y `changeFrequency`
 *
 * Google dice abiertamente que los ignora. Se incluye solo `priority`, derivada
 * del nivel, porque otros rastreadores sí la miran y cuesta cero. No se incluye
 * `changeFrequency`: sería una promesa que no cumpliríamos.
 */

/** Los cuatro ficheros. Los enumera también robots.txt, que es quien los anuncia. */
export const SITEMAP_KINDS = ['tematiques', 'comarques', 'municipis', 'nuclis'] as const;
type Kind = typeof SITEMAP_KINDS[number];

export async function generateSitemaps() {
  return SITEMAP_KINDS.map((id) => ({ id }));
}

/** Páginas que no salen del territorio: portada, temáticas y estaciones. */
function thematic(lastModified: Date): MetadataRoute.Sitemap {
  const fixed: Array<[string, number]> = [
    ['/', 1],
    ['/cerca', 0.6],
    ['/mapa', 0.9],
    ['/radar', 0.9],
    ['/avisos', 0.9],
    ['/ranquings', 0.8],
    ['/mar', 0.8],
    ['/aigua', 0.7],
    ['/neu', 0.7],
    ['/aire', 0.7],
    ['/bolets', 0.7],
    ['/senderisme', 0.7],
    ['/nautica', 0.7],
    ['/estacions', 0.6],
    ['/dades', 0.5],
    ['/estat', 0.4],
  ];

  return [
    ...fixed.map(([path, priority]) => ({
      url: absolute(path), lastModified, priority,
    })),
    ...operativeStations().map((s) => ({
      url: absolute(`/estacions/${s.codi}`), lastModified, priority: 0.5,
    })),
  ];
}

/**
 * En Next 16 el `id` llega **como promesa**, no como cadena.
 *
 * El route handler que genera Next llama a `handler({ id: targetIdPromise })`.
 * Comparar esa promesa con `'tematiques'` da falso siempre, así que los cuatro
 * ficheros caían en la última rama y servían **los mismos 3.303 nuclis** — y la
 * portada, las temáticas y las 190 estaciones no salían en ningún sitemap.
 *
 * Nada fallaba: cuatro XML válidos, con 200, con URLs correctas. Solo que las
 * mismas cuatro veces.
 *
 * Se espera con `await`, que funciona igual si algún día vuelve a ser un valor.
 */
export default async function sitemap(
  { id }: { id: Kind | Promise<Kind> },
): Promise<MetadataRoute.Sitemap> {
  // Un preview no publica sitemap. Si lo publicara, estaría ofreciendo a
  // indexar 4.500 copias de un sitio que ya existe en otra URL.
  if (!IS_PRODUCTION) return [];

  const kind = await id;
  const lastModified = new Date(String(buildSummary().builtAt));

  if (kind === 'tematiques') return thematic(lastModified);

  const wanted = kind === 'comarques'
    ? (level: string) => level === 'comarca'
    : kind === 'municipis'
      ? (level: string) => level === 'municipi'
      : (level: string) => level !== 'comarca' && level !== 'municipi';

  // La prioridad sale del nivel de indexación, que es el que ya decide cuánta
  // atención merece cada ruta en el resto del sitio.
  const byTier: Record<string, number> = { A: 0.9, B: 0.7, C: 0.5, D: 0.3 };

  return allPublishedPaths()
    .filter((p) => wanted(p.level))
    .map((p) => ({
      url: absolute(p.path),
      lastModified,
      priority: byTier[p.tier] ?? 0.5,
    }));
}
