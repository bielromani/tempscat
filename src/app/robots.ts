import type { MetadataRoute } from 'next';
import { SITEMAP_KINDS } from './sitemap';
import { IS_PRODUCTION, absolute } from '@/lib/site';

/**
 * robots.txt
 *
 * ## Lo que NO se bloquea, y es lo importante
 *
 * `/api/` **no se prohíbe**, aunque las respuestas del feed no deban indexarse.
 * Ya llevan `X-Robots-Tag: noindex`, y una cabecera solo se lee si el robot ha
 * podido descargar la respuesta: prohibir la ruta en robots.txt impediría
 * justamente eso, y la URL acabaría indexada sin contenido —el peor de los dos
 * mundos— porque el buscador sabe que existe pero no le dejamos leer que no la
 * quiere. Es el error clásico de combinar `Disallow` con `noindex`.
 *
 * ## Lo que sí
 *
 * Las teselas del radar. Son miles de PNG servidos por un route handler y no
 * son contenido: gastan presupuesto de rastreo y no aportan nada. Aquí sí vale
 * `Disallow`, porque no hay nada que desindexar, solo que no visitar.
 */
export default function robots(): MetadataRoute.Robots {
  // Un preview no se rastrea. La regla vive aquí además de en la meta robots
  // porque esto corta antes: el robot ni descarga la página.
  if (!IS_PRODUCTION) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/radar/t/'],
      },
    ],
    /*
     * Los cuatro, enumerados.
     *
     * `generateSitemaps()` publica `/sitemap/{tipus}.xml` pero **no genera un
     * índice en `/sitemap.xml`**: esa URL devuelve la página de 404. Apuntar
     * ahí —que es lo que decía la primera versión de este fichero— le habría
     * dado al buscador un HTML de error donde esperaba XML.
     *
     * robots.txt admite tantas líneas `Sitemap:` como haga falta, así que no
     * hace falta inventarse un índice: se listan los cuatro.
     */
    sitemap: SITEMAP_KINDS.map((kind) => absolute(`/sitemap/${kind}.xml`)),
  };
}
