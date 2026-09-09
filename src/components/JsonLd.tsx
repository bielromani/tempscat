import { absolute } from '@/lib/site';

/**
 * Les dades estructurades, en un sol lloc.
 *
 * ## Per què deixen de ser tres còpies
 *
 * Perquè n'hi havia dues, a la fitxa de municipi i a la d'entitat, i les dues
 * portaven el mateix defecte: el `item` d'una molla de pa era **una ruta i no
 * una adreça**. Schema.org espera una URL, i una ruta relativa la resol el
 * navegador però no la valida cap eina — o sigui que el rastre de molles de
 * 4.293 pàgines es publicava trencat sense que res avisés. Amb un sol
 * constructor, un defecte així s'arregla un cop.
 *
 * ## I per què no hi ha cap `WeatherForecast`
 *
 * Perquè **no existeix a schema.org**. Qui el fa servir injecta marcatge
 * invàlid; el que hi ha de veritat és `Place` per al lloc i `BreadcrumbList`
 * per al camí, i és el que es publica.
 */

/** El bloc, tal com va al HTML. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      // El contingut és nostre i surt de `JSON.stringify`, que ja escapa el
      // que cal; l'única cosa que se li escapa és `</script>` dins d'una
      // cadena, i per això va substituït.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/<\//g, '<\\/'),
      }}
    />
  );
}

/**
 * El rastre de molles, amb **adreces absolutes**.
 *
 * Rep el que la pàgina ja ensenya a la seva barra de navegació, perquè les
 * molles del marcatge i les que es veuen han de ser les mateixes: si es
 * construeixen a banda, un dia una pàgina en dirà tres al lector i quatre al
 * buscador.
 */
export function breadcrumbLd(trail: Array<{ nom: string; path: string }>) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.nom,
      item: absolute(b.path),
    })),
  };
}

/** Un graf de schema.org amb el context posat, que és com s'escriu. */
export function graph(...nodes: unknown[]) {
  return { '@context': 'https://schema.org', '@graph': nodes.filter(Boolean) };
}
