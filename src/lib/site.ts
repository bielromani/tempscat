import 'server-only';
import type { Lang } from './lang';

/**
 * De dónde se cuelga el sitio.
 *
 * ## Por qué esto es un fichero y no una constante
 *
 * Hasta ahora `metadataBase` decía `https://meteo.example`, así que **las 4.293
 * páginas declaraban su canónica en un dominio que no es nuestro**:
 *
 *     <link rel="canonical" href="https://meteo.example/maresme/alella"/>
 *
 * Es el peor fallo de indexación que existe — le dices al buscador que la
 * versión buena de tu página vive en otro sitio — y estaba en el build, listo
 * para desplegarse.
 *
 * ## Y por qué los previews no pueden llevar la misma
 *
 * Vercel da una URL distinta a cada despliegue de prueba. Si todas declararan
 * la canónica de producción, cada rama sería una copia del sitio entero
 * peleándose consigo misma; y si declararan la suya propia sin más, tendrías
 * cuarenta copias indexadas. La salida es la de abajo: **el preview lleva su
 * propia URL y va marcado `noindex`**.
 *
 * ## Sin `NEXT_PUBLIC_`, y no es un detalle
 *
 * La primera versión la llamó `NEXT_PUBLIC_SITE_URL` por costumbre, y Vercel
 * avisa con razón: ese prefijo hace que Next **incruste el valor en el paquete
 * del navegador**, y una variable incrustada no se puede marcar como secreta.
 *
 * Aquí no hace ninguna falta. Este fichero es `server-only`, no hay un solo
 * componente de cliente en el proyecto, y todo lo que sale de aquí —canónicas,
 * robots, sitemaps, los identificadores de los feeds— se resuelve en el
 * servidor. El prefijo solo servía para enviar al navegador una cadena que no
 * va a leer nadie y para que la interfaz de Vercel te haga una pregunta
 * incómoda con una respuesta equivocada a cada lado.
 *
 * El orden de preferencia:
 *
 *  1. `SITE_URL` — el dominio de verdad. Es el que manda.
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` — la URL estable de producción de Vercel,
 *     por si el dominio propio aún no está conectado.
 *  3. `VERCEL_URL` — la del despliegue concreto. Solo previews.
 *  4. localhost.
 */

function pick(): { url: string; production: boolean } {
  const own = process.env.SITE_URL?.trim();
  if (own) return { url: own.replace(/\/$/, ''), production: true };

  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prod && process.env.VERCEL_ENV === 'production') {
    return { url: `https://${prod}`, production: true };
  }

  const deploy = process.env.VERCEL_URL;
  if (deploy) return { url: `https://${deploy}`, production: false };

  return { url: 'http://localhost:3000', production: false };
}

const resolved = pick();

/** Base absoluta, sin barra final. */
export const SITE_URL = resolved.url;

/**
 * Si esto es el sitio de verdad.
 *
 * Manda sobre dos cosas: si las páginas se dejan indexar y si el sitemap se
 * publica. Un preview que se indexa es tráfico robado a uno mismo.
 */
export const IS_PRODUCTION = resolved.production;

/**
 * L'origen de cada idioma: el castellà és el mateix domini amb `es.` davant
 * (vegeu `src/lib/lang.ts`). En local, `es.localhost:3000`, que el navegador
 * ja resol a la mateixa màquina.
 */
export function siteUrl(lang: Lang = 'ca'): string {
  if (lang === 'ca') return SITE_URL;
  const u = new URL(SITE_URL);
  u.hostname = `es.${u.hostname.replace(/^www\./, '')}`;
  return u.origin;
}

/** URL absoluta de una ruta interna, en l'idioma que es demani. */
export function absolute(path: string, lang: Lang = 'ca'): string {
  return `${siteUrl(lang)}${path.startsWith('/') ? path : `/${path}`}`;
}

/*
 * El castellà no s'indexa fins que no estigui traduït sencer: una fitxa a mig
 * traduir indexada en castellà és pitjor que cap. Es posa a `true` el dia que
 * l'última pàgina deixi de tenir text en català (`npm run check:castella`).
 *
 * Mana sobre tres coses alhora, i per això viu aquí: la meta robots del
 * castellà, l'`hreflang` de les dues llengües i el sitemap del castellà.
 */
export const ES_PUBLIC = false;

/**
 * La canònica i l'`hreflang` d'una pàgina, per a `metadata.alternates`.
 *
 * La canònica va relativa i la resol el `metadataBase` de cada domini, així que
 * cada llengua és canònica de si mateixa. Les alternatives van absolutes perquè
 * apunten a l'altre domini.
 *
 * Mentre el castellà no es publica no hi ha `hreflang`: assenyalar una pàgina
 * `noindex` com a versió en una altra llengua és una contradicció que el
 * cercador resol com vol.
 */
export function alternatesFor(path: string): {
  canonical: string; languages?: Record<string, string>;
} {
  if (!ES_PUBLIC) return { canonical: path };
  return {
    canonical: path,
    languages: { ca: absolute(path, 'ca'), es: absolute(path, 'es'), 'x-default': absolute(path, 'ca') },
  };
}
