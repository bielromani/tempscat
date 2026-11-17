/**
 * El `<Link>` de tot el web: navega sense recarregar, però **no precarrega**.
 *
 * El de Next precarrega cada enllaç que entra a la pantalla, i cada precàrrega
 * és una petició al CDN que paga el compte. Mesurat el 17 de novembre de 2026
 * a la fitxa de Cambrils: de les 43 peticions d'una visita, **12 eren
 * precàrregues** —`/radar` i `/avisos/alertes` tres vegades cadascuna—, i
 * per això aquelles dues rutes semblaven les més visitades del web. El pla
 * Pro porta un milió de peticions al mes per a tot el compte; vegeu
 * «El pla Pro porta un milió de peticions» a AGENTS.md.
 *
 * El que es perd és poc: la pàgina es demana en clicar, que és el que fa
 * qualsevol web sense JavaScript, i les nostres són pàgines de servidor de
 * 200 ms. Si mai cal precarregar un enllaç concret, `prefetch` es pot passar
 * a mà. El lint prohibeix importar `next/link` fora d'aquí.
 */
import NextLink from 'next/link';
import type { ComponentProps } from 'react';

export default function Link({ prefetch = false, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={prefetch} {...props} />;
}
