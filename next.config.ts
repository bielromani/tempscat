import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

/*
 * Les 43 comarques, per acotar la capçalera de les fitxes.
 *
 * `/:a/:b` i `/:a/:b/:c` també casarien `/api/lloc/<c>/<m>` o
 * `/senderisme/rutes/eix/<ref>`, que tenen la seva pròpia memòria cau. Amb el
 * primer tram limitat als slugs de comarca només hi entren les fitxes.
 */
const COMARQUES = (JSON.parse(readFileSync(join(process.cwd(), 'data', 'build', 'comarques.json'), 'utf8')) as Array<{ slug: string }>)
  .map((c) => c.slug)
  .join('|');

/*
 * ── Les pàgines amb dades d'ara ─────────────────────────────────────────────
 *
 * Totes les que ensenyen una lectura, un radar, un avís o un cel calculat amb
 * l'hora. Es generen **a cada petició** (`dynamic = 'force-dynamic'` a la
 * pàgina) i el CDN de Vercel les guarda cinc minuts.
 *
 * ## Per què no ISR
 *
 * Perquè ISR serveix primer la còpia que té i la refà després, tingui l'edat
 * que tingui. En un web amb milers de pàgines i poques visites per pàgina, això
 * vol dir que qui entra veu gairebé sempre la còpia vella: la temperatura de fa
 * hores i, a les fitxes, **el cel de fa hores** —la nit dibuixada a mig matí—,
 * i en recarregar surt la bona. Mesurat el 29 de setembre de 2026: 20 de 40
 * fitxes sortien amb 1,3 a 5,8 hores. No hi ha manera de dir-li a ISR «si és
 * més vella que això, espera't».
 *
 * Amb la pàgina dinàmica i `max-age` al CDN —sense `stale-while-revalidate`—
 * sí: passats els cinc minuts, el CDN no serveix la vella, la torna a demanar.
 * Ningú no veu mai res de més de cinc minuts, i qui paga la generació és qui la
 * veu.
 *
 * ## Per què cinc minuts
 *
 * La XEMA publica cada mitja hora i el worker la baixa cada deu: més curt no
 * afegiria cap número nou. El que sí que es mou és el sol —un grau i quart en
 * cinc minuts—, i això el cel del titular ho aguanta.
 *
 * `Vercel-CDN-Cache-Control` i no `Cache-Control` perquè només el llegeix el
 * CDN de Vercel: el navegador no guarda res i torna a preguntar sempre.
 *
 * ## I el desplegament
 *
 * Aquestes pàgines ja no es pregeneren al build: 947 municipis, 683 itineraris
 * i 189 estacions menys, que eren gairebé tot el gigabyte de cada desplegament.
 *
 * Si s'afegeix una pàgina amb dades d'ara, va a **tots dos llocs**: aquí i el
 * `force-dynamic` de la pàgina. Amb només la capçalera, ISR segueix manant;
 * amb només el `force-dynamic`, es genera a cada visita sense cap memòria.
 */
const LIVE_PAGES = [
  '/',
  `/:comarca(${COMARQUES})`,
  `/:comarca(${COMARQUES})/:municipi`,
  `/:comarca(${COMARQUES})/:municipi/:entitat`,
  '/radar',
  '/mapa',
  '/mapa/interactiu',
  '/avisos',
  '/mar',
  '/nautica',
  '/neu',
  '/senderisme',
  '/senderisme/rutes/:slug',
  '/cameres',
  '/cameres/:slug',
  '/estacions',
  '/estacions/:codi',
  '/ranquings',
  '/aigua',
  '/aire',
  '/estat',
];

const nextConfig: NextConfig = {
  /*
   * El territorio tiene que viajar con las funciones.
   *
   * `territory.ts` y `weather.ts` leen con `readFileSync(join(process.cwd(),
   * 'data', …))`, una ruta que se construye en tiempo de ejecución. El trazado
   * de ficheros de Next mira los `import` y las rutas literales, así que **no
   * puede verla**: sin esta lista, el despliegue sube el código y deja los
   * datos en casa.
   *
   * No falla en local, donde el directorio está de todos modos. Falla en
   * producción, y falla en silencio: las páginas se generan con `null` en todo.
   *
   * `data/cache/` no está aquí a propósito. Son datos vivos y no pueden viajar
   * dentro de un despliegue: se leen del almacén de objetos.
   */
  outputFileTracingIncludes: {
    '/**': ['./data/build/**'],
  },

  /*
   * I a l'inrevés: les dades vives no viatgen mai dins d'un desplegament.
   *
   * `cache-store.ts` construeix la ruta de `data/cache/` en temps d'execució, i
   * el traçador, que no la pot resoldre, avisava que podia enganxar-ho tot.
   * En producció es llegeix del magatzem; si un dia el directori existís al
   * disc del build, pujaria centenars de megues que ningú no llegiria.
   */
  outputFileTracingExcludes: {
    '/**': ['./data/cache/**', './data/raw/**'],
  },

  /*
   * El relleu no canvia mai, i porta la versio al nom.
   *
   * Next serveix `public/` amb `max-age=0, must-revalidate`, que per a una
   * imatge de 183 kB que apareix a cada visita del radar vol dir una peticio de
   * validacio cada vegada. Amb la versio al nom del fitxer es pot dir
   * `immutable` sense mentir: si algun dia es recalcula, sera `relleu-v2.png`.
   */
  /*
   * `/bolets` se retiró, y una URL publicada no se deja caer en un 404.
   *
   * La página ordenó durante meses las 189 estaciones por lluvia acumulada
   * bajo un título que prometía setas, y eso era ordenar **aparatos** para
   * contestar una pregunta sobre **bosques**: decía dónde hay pluviómetro y
   * dónde descargó la última tormenta. Se corregiría con una capa de usos del
   * suelo, que no tenemos, así que no se corrige: se quita.
   *
   * Lo que sí seguía siendo cierto —cuánta agua ha caído y dónde— vive en dos
   * sitios mejores: la lista de lluvia de `/ranquings`, que es adonde apunta
   * esto, y el bloque de cada ficha, que contesta la pregunta donde se hace,
   * con la estación que la mide y su distancia.
   *
   * Permanente y no temporal: no va a volver.
   */
  async redirects() {
    return [
      { source: '/bolets', destination: '/ranquings', permanent: true },
    ];
  },

  async headers() {
    return [
      {
        source: '/relleu-:version.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Ver «Les pàgines amb dades d'ara», a dalt.
      ...LIVE_PAGES.map((source) => ({
        source,
        headers: [{ key: 'Vercel-CDN-Cache-Control', value: 'max-age=300' }],
      })),
    ];
  },
};

export default nextConfig;
