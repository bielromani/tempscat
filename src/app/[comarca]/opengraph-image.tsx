import { comarcaName } from '@/lib/format';
import { OG_SIZE, ogImage } from '@/lib/og';
import { comarcaBySlug, municipisOfComarca } from '@/lib/territory';

/** La imatge per compartir la pàgina d'una comarca. */
export const alt = 'El temps de la comarca, a tempscat';
export const size = OG_SIZE;
export const contentType = 'image/png';

export default async function Image({ params }: { params: Promise<{ comarca: string }> }) {
  const { comarca } = await params;
  const com = comarcaBySlug(comarca);
  if (!com) return ogImage({ kicker: 'El temps a', title: 'Catalunya' });
  const n = municipisOfComarca(com.codi).length;
  return ogImage({
    kicker: 'El temps a la comarca',
    title: comarcaName(com.nom),
    subtitle: `${n} ${n === 1 ? 'municipi' : 'municipis'}, poble a poble`,
  });
}
