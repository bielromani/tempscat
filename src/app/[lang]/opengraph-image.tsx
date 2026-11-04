import { OG_SIZE, ogImage } from '@/lib/og';

/**
 * La imatge per compartir el web i qualsevol pàgina que no en porti una de
 * pròpia: la portada, el radar, els avisos, les seccions.
 */
export const alt = 'tempscat, el temps a cada poble de Catalunya';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default function Image() {
  return ogImage({
    kicker: 'El temps a',
    title: 'Cada poble de Catalunya',
    subtitle: 'Amb la seva altitud i l’estació que el mesura',
  });
}
