import { OG_SIZE, ogImage } from '@/lib/og';
import { isLang, tr } from '@/lib/lang';

/**
 * La imatge per compartir el web i qualsevol pàgina que no en porti una de
 * pròpia: la portada, el radar, els avisos, les seccions.
 *
 * L'`alt` és una constant del fitxer i Next no el deixa variar per idioma
 * sense canviar l'adreça de la imatge (`generateImageMetadata`): es queda en
 * català, que és el que llegeix qui no veu la imatge, no qui la veu.
 */
export const alt = 'tempscat, el temps a cada poble de Catalunya';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  const lang = isLang(l) ? l : 'ca';
  return ogImage({
    kicker: tr(lang, 'El temps a', 'El tiempo en'),
    title: tr(lang, 'Cada poble de Catalunya', 'Cada pueblo de Cataluña'),
    subtitle: tr(lang, 'Amb la seva altitud i l’estació que el mesura', 'Con su altitud y la estación que lo mide'),
    lang,
  });
}
