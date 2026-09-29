import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

/*
 * Les 43 comarques, per acotar una capçalera a les fitxes de nucli.
 *
 * `/:a/:b/:c` també casaria `/senderisme/rutes/<slug>` i `/api/lloc/<c>/<m>`,
 * que tenen la seva pròpia memòria cau. Amb el primer tram limitat als slugs de
 * comarca només hi entren les ~3.300 fitxes de nucli.
 */
const COMARQUES = (JSON.parse(readFileSync(join(process.cwd(), 'data', 'build', 'comarques.json'), 'utf8')) as Array<{ slug: string }>)
  .map((c) => c.slug)
  .join('|');

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
      /*
       * Les fitxes de nucli es generen a cada petició i el CDN de Vercel les
       * guarda deu minuts. Prova de 48 hores, des del 29 de setembre de 2026.
       *
       * Amb ISR, una fitxa amb menys d'una visita diària se serveix gairebé
       * sempre caducada: mesurat aquell dia, 20 de 40 sortien amb 1,3 a 5,8
       * hores —el sostre era el darrer desplegament, que buida la memòria cau—
       * i la resta es generaven en aquell moment. I la regeneració la paga
       * qui s'endú la còpia vella.
       *
       * Deu minuts perquè la XEMA arriba cada mitja hora i amb 45-65 minuts de
       * retard: més curt no afegiria cap número nou. `Vercel-CDN-Cache-Control`
       * i no `Cache-Control` perquè només el llegeix el CDN de Vercel: el
       * navegador no guarda res i torna a preguntar. Si la prova convenç, la
       * fitxa de municipi va igual; si no, es treu aquesta regla i el
       * `force-dynamic` de la pàgina de nucli.
       */
      {
        source: `/:comarca(${COMARQUES})/:municipi/:entitat`,
        headers: [
          { key: 'Vercel-CDN-Cache-Control', value: 'max-age=600' },
        ],
      },
    ];
  },
};

export default nextConfig;
