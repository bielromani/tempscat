import { comarcaName } from '@/lib/format';
import { isLang, tr } from '@/lib/lang';
import { OG_SIZE, ogImage } from '@/lib/og';
import { comarcaBySlug, municipisOfComarca } from '@/lib/territory';

/** La imatge per compartir la pàgina d'una comarca. */
export const alt = 'El temps de la comarca, a TempsCat';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ lang: string; comarca: string }> }) {
  const { lang: l, comarca } = await params;
  const lang = isLang(l) ? l : 'ca';
  const com = comarcaBySlug(comarca);
  if (!com) return ogImage({ kicker: tr(lang, 'El temps a', 'El tiempo en'), title: tr(lang, 'Catalunya', 'Cataluña'), lang });
  const n = municipisOfComarca(com.codi).length;
  return ogImage({
    kicker: tr(lang, 'El temps a la comarca', 'El tiempo en la comarca'),
    title: comarcaName(com.nom, lang),
    subtitle: tr(
      lang,
      `${n} ${n === 1 ? 'municipi' : 'municipis'}, poble a poble`,
      `${n} ${n === 1 ? 'municipio' : 'municipios'}, pueblo a pueblo`,
    ),
    lang,
  });
}
