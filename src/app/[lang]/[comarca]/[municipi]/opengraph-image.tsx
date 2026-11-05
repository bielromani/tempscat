import { aNameParts, comarcaName, int } from '@/lib/format';
import { isLang, tr } from '@/lib/lang';
import { OG_SIZE, ogImage } from '@/lib/og';
import { comarcaOf, locationByPath } from '@/lib/territory';

/** La imatge per compartir la fitxa d'un municipi. Què hi va i què no, a `src/lib/og.tsx`. */
export const alt = 'El temps del municipi, a tempscat';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ lang: string; comarca: string; municipi: string }> }) {
  const { lang: l, comarca, municipi } = await params;
  const lang = isLang(l) ? l : 'ca';
  const loc = locationByPath(`/${comarca}/${municipi}`);
  const com = loc ? comarcaOf(loc) : undefined;
  if (!loc) return ogImage({ kicker: tr(lang, 'El temps a', 'El tiempo en'), title: tr(lang, 'Catalunya', 'Cataluña'), lang });

  const { prep, rest } = aNameParts(loc.nom, lang);
  return ogImage({
    kicker: `${tr(lang, 'El temps', 'El tiempo')} ${prep}`,
    title: rest,
    subtitle: [
      com && comarcaName(com.nom, lang),
      loc.altitud != null && tr(lang, `${int(loc.altitud)} m d’altitud`, `${int(loc.altitud)} m de altitud`),
    ].filter(Boolean).join(' · '),
    lang,
  });
}
