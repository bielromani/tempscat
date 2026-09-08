import type { NextConfig } from 'next';

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
    ];
  },
};

export default nextConfig;
