import { aNameParts, comarcaName } from '@/lib/format';
import { OG_SIZE, ogImage } from '@/lib/og';
import { comarcaOf, locationByPath } from '@/lib/territory';

/** La imatge per compartir la fitxa d'un municipi. Què hi va i què no, a `src/lib/og.tsx`. */
export const alt = 'El temps del municipi, a tempscat';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ comarca: string; municipi: string }> }) {
  const { comarca, municipi } = await params;
  const loc = locationByPath(`/${comarca}/${municipi}`);
  const com = loc ? comarcaOf(loc) : undefined;
  if (!loc) return ogImage({ kicker: 'El temps a', title: 'Catalunya' });

  const { prep, rest } = aNameParts(loc.nom);
  return ogImage({
    kicker: `El temps ${prep}`,
    title: rest,
    subtitle: [com && comarcaName(com.nom), loc.altitud != null && `${loc.altitud.toLocaleString('ca-ES')} m d’altitud`]
      .filter(Boolean).join(' · '),
  });
}
