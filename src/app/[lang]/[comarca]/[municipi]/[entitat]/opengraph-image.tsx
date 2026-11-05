import { aNameParts, comarcaName, int, placeName } from '@/lib/format';
import { isLang, tr } from '@/lib/lang';
import { OG_SIZE, ogImage } from '@/lib/og';
import { comarcaOf, locationById, locationByPath } from '@/lib/territory';

/**
 * La imatge per compartir la fitxa d'un nucli. Va a part de la del municipi
 * perquè, sense ella, el nucli heretaria la imatge del seu municipi i Lilla es
 * compartiria amb el nom de Montblanc.
 */
export const alt = 'El temps del nucli, a tempscat';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ lang: string; comarca: string; municipi: string; entitat: string }> }) {
  const { lang: l, comarca, municipi, entitat } = await params;
  const lang = isLang(l) ? l : 'ca';
  const loc = locationByPath(`/${comarca}/${municipi}/${entitat}`);
  if (!loc) return ogImage({ kicker: tr(lang, 'El temps a', 'El tiempo en'), title: tr(lang, 'Catalunya', 'Cataluña'), lang });
  const com = comarcaOf(loc);
  const mun = locationById(loc.parentId ?? '');

  const { prep, rest } = aNameParts(loc.nom, lang);
  return ogImage({
    kicker: `${tr(lang, 'El temps', 'El tiempo')} ${prep}`,
    title: rest,
    subtitle: [mun && placeName(mun.nom, lang), com && comarcaName(com.nom, lang), loc.altitud != null && `${int(loc.altitud)} m`]
      .filter(Boolean).join(' · '),
    lang,
  });
}
