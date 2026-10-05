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
 * Ninguno de estos agentes manda un lector: se llevan el sitio entero para
 * entrenar, y un modelo entrenado con la predicción de hoy «sabrá» dentro de
 * un mes un tiempo que ya pasó. Los buscadores de verdad —Googlebot, Bingbot,
 * Applebot, el de Yandex— no están en la lista y siguen entrando por todas
 * partes.
 *
 * `Claude-Web` y `anthropic-ai` se quedan aunque Anthropic ya no los use: un
 * nombre retirado en la lista no cuesta nada, y alguien puede seguir
 * rastreando con él.
 */
const MODEL_CRAWLERS = [
  'GPTBot',
  'ClaudeBot', 'Claude-Web', 'anthropic-ai',
  'CCBot', 'Bytespider',
  'Amazonbot', 'meta-externalagent', 'FacebookBot',
  'Diffbot', 'Omgilibot', 'Timpibot', 'YouBot', 'ImagesiftBot',
];

/*
 * Los que **sí** pueden entrar, y por qué no están arriba.
 *
 * Hasta el 5 de octubre de 2026 estaban todos en la lista de bloqueo. Lo que
 * los separa es que estos leen la página **en el momento** en que alguien
 * pregunta —«quin temps fa a Lilla»— y contestan citándola con un enlace: es
 * el mismo trato que un buscador, y es justo lo que este sitio quiere. Con el
 * plan Pro y la caché de cinco minutos del CDN, además, una visita de robot ya
 * no regenera nada que no se regenerara igual.
 *
 *  · `OAI-SearchBot` y `ChatGPT-User`: la búsqueda de ChatGPT y las páginas que
 *    abre cuando un usuario se lo pide.
 *  · `Claude-SearchBot` y `Claude-User`: lo mismo para Claude.
 *  · `PerplexityBot` y `Perplexity-User`.
 *  · `Google-Extended` y `Applebot-Extended` no son rastreadores: son la señal
 *    con la que Google y Apple deciden si pueden usar lo que ya han rastreado
 *    Googlebot y Applebot en Gemini y en Apple Intelligence. Google no separa
 *    el entrenamiento de la respuesta —es una sola señal para las dos cosas—,
 *    así que para salir en Gemini hay que aceptar las dos. Los datos ya son
 *    CC BY, y se aceptan.
 *
 * No van en ninguna regla propia: caen en la de `*`, que les deja leerlo todo
 * menos las rutas de imágenes. Se listan aquí para que nadie los vuelva a
 * meter arriba creyendo que se han olvidado, y si alguien lo hace, el build
 * falla. Si el consumo de Vercel subiera
 * por alguno de ellos, se le vuelve a cerrar a él, no a todos.
 */
const ANSWER_AGENTS = [
  'OAI-SearchBot', 'ChatGPT-User',
  'Claude-SearchBot', 'Claude-User',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Applebot-Extended',
];

// Si uno acaba en las dos listas, el bloqueo gana sin que nadie lo vea: que pete el build.
const both = ANSWER_AGENTS.filter((a) => MODEL_CRAWLERS.includes(a));
if (both.length) throw new Error(`robots.ts: ${both.join(', ')} és alhora a ANSWER_AGENTS i a MODEL_CRAWLERS.`);

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
 * Son route handlers que devuelven una imagen: teselas del radar, del mapa
 * base y del relieve, el campo de viento y los fotogramas de las cámaras. Un
 * buscador no tiene nada que entender ahí dentro, y en cambio son miles de
 * ficheros —el mapa base solo, del zoom 6 al 14— que se llevarían el
 * presupuesto de rastreo y la cuota de salida.
 *
 * `/camp/` ya no existe: servía el campo de lluvia, que dejó de hacerse el 29
 * de septiembre de 2026. Se queda en la lista porque esas URL salían en el
 * HTML de `/radar`, una por hora, y sin el `Disallow` cada una que un
 * rastreador se haya guardado sería una visita que acaba en un 404 renderizado.
 *
 * Aquí `Disallow` es la herramienta correcta y no la trampa que se explica
 * abajo con `/api/`: no hay ninguna URL que desindexar, solo tráfico que no
 * tiene por qué existir.
 *
 * Las fichas que las llevan dentro siguen siendo legibles sin ellas: el mapa de
 * una ruta es el dibujo de algo que el texto de la página ya dice.
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
 * Las seis rutas de imágenes, para todo el mundo, y los recolectores de
 * entrenamiento y de SEO, enteros. Los asistentes que citan (`ANSWER_AGENTS`)
 * entran como cualquier buscador. El porqué de cada grupo está en su constante.
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
