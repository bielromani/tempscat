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
