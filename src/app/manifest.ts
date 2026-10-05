import type { MetadataRoute } from 'next';

/**
 * El que fa que el web es pugui afegir a la pantalla d'inici del mòbil amb el
 * seu nom i la seva icona, i que s'obri sense la barra del navegador.
 *
 * **No porta cap service worker**, i és a posta: el web no funciona sense
 * connexió —tot el que ensenya és d'ara— i un service worker és JavaScript a
 * cada pàgina per desar una còpia que justament no s'ha d'ensenyar mai. Per
 * afegir-lo a la pantalla d'inici no cal.
 *
 * Els colors són `--paper` de `globals.css` en hex: el manifest no entén OKLCH.
 * Les icones surten d'`icon.svg`; la «maskable» porta el degradat fins a la
 * vora i el dibuix dins de la zona segura del 80 %, perquè Android la retalla
 * en cercle o en esquaix segons el telèfon.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'tempscat · El temps a Catalunya',
    short_name: 'tempscat',
    description: 'El temps a cada poble de Catalunya, amb la seva altitud i l’estació que el mesura.',
    lang: 'ca',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0e1e35',
    theme_color: '#0e1e35',
    icons: [
      { src: '/icons/app/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/app/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/app/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
