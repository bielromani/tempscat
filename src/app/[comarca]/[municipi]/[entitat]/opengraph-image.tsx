import { aNameParts, comarcaName } from '@/lib/format';
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

export default async function Image({ params }: { params: Promise<{ comarca: string; municipi: string; entitat: string }> }) {
  const { comarca, municipi, entitat } = await params;
  const loc = locationByPath(`/${comarca}/${municipi}/${entitat}`);
  if (!loc) return ogImage({ kicker: 'El temps a', title: 'Catalunya' });
  const com = comarcaOf(loc);
  const mun = locationById(loc.parentId ?? '');

  const { prep, rest } = aNameParts(loc.nom);
  return ogImage({
    kicker: `El temps ${prep}`,
    title: rest,
    subtitle: [mun?.nom, com && comarcaName(com.nom), loc.altitud != null && `${loc.altitud.toLocaleString('ca-ES')} m`]
      .filter(Boolean).join(' · '),
  });
}
