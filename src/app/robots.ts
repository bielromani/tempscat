import type { MetadataRoute } from 'next';
import { SITEMAP_KINDS } from './sitemap';
import { IS_PRODUCTION, absolute } from '@/lib/site';

/*
 * Los recolectores de modelos, bloqueados por nombre.
 *
 * No es una postura sobre la IA: es una factura. En septiembre de 2026 el sitio
 * sirvió **1.047.191 páginas** con un tráfico humano que no llega a cubrir ni
 * una visita diaria por ficha, y cada una de esas peticiones regeneró la página
 * entera —2.108.560 escrituras, exactamente el doble: el HTML y la carga RSC—.
 * Son 29,19 GB contra un techo de 10, y las cuentas salen a 28 kB por lectura,
 * que es justo lo que pesa una ficha comprimida.
 *
 * Ninguno de estos agentes manda un lector. Los buscadores de verdad
 * —Googlebot, Bingbot, Applebot, el de Yandex— no están en la lista y siguen
 * entrando por todas partes: el proyecto existe para que alguien encuentre «el
 * temps a Lilla» escribiéndolo en un buscador.
 *
 * `Google-Extended` y `Applebot-Extended` no son rastreadores: son la señal de
 * exclusión del entrenamiento de Gemini y de Apple Intelligence. Bloquearlas no
 * quita ni una visita de Google ni de Siri, y va aquí por lo mismo que lo demás.
 */
const MODEL_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-Web', 'anthropic-ai',
  'CCBot', 'Bytespider', 'PerplexityBot', 'Perplexity-User',
  'Amazonbot', 'meta-externalagent', 'FacebookBot',
  'Diffbot', 'Omgilibot', 'Timpibot', 'YouBot', 'ImagesiftBot',
  'Google-Extended', 'Applebot-Extended',
];

/*
 * Los agentes de SEO, por el mismo motivo y sin el matiz.
 *
 * Rastrean el sitio entero para vender informes de enlaces a terceros. No
 * indexan nada, no traen a nadie y pesan como el que más.
 */
const SEO_CRAWLERS = ['AhrefsBot', 'SemrushBot', 'DataForSeoBot', 'MJ12bot', 'DotBot', 'BLEXBot'];

/*
 * Rutas que sirven bytes y no contenido.
 *
 * Las seis son route handlers que devuelven una imagen: teselas del radar, del
 * mapa base y del relieve, el campo de lluvia, el campo de viento y los
 * fotogramas de las cámaras. Un buscador no tiene nada que entender ahí dentro,
 * y en cambio son miles de ficheros —el mapa base solo, del zoom 6 al 14— que
 * se llevarían el presupuesto de rastreo y la cuota de salida.
 *
 * Aquí `Disallow` es la herramienta correcta y no la trampa que se explica
 * abajo con `/api/`: no hay ninguna URL que desindexar, solo tráfico que no
 * tiene por qué existir.
 *
 * Las fichas que las llevan dentro siguen siendo legibles sin ellas: el mapa de
 * una ruta o el bloque de «cap on va la pluja» son el dibujo de algo que el
 * texto de la página ya dice.
 */
const ASSET_PATHS = ['/radar/t/', '/base/', '/relleu/', '/camp/', '/vent/', '/cameres/i/'];

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
 * Las seis rutas de imágenes, para todo el mundo, y los recolectores de modelos
 * y de SEO, enteros. El porqué de cada grupo está en su constante.
 *
 * ## Y lo que esto no es
 *
 * Un fichero que se cumple por buena voluntad. Quien no lo respete seguirá
 * entrando, y la manera de pararlo es una regla en Cloudflare, no aquí. Esto
 * corta a los que sí lo leen, que en la medición de septiembre eran la mayoría.
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
        disallow: ASSET_PATHS,
      },
      {
        userAgent: [...MODEL_CRAWLERS, ...SEO_CRAWLERS],
        disallow: '/',
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
