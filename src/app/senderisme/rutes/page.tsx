import type { Metadata } from 'next';
import Link from 'next/link';
import { allRoutes, networkLabel, refApart } from '@/lib/routes';
import { allComarques } from '@/lib/territory';
import { ListFilter, groupsOf } from '@/components/ListFilter';
import { comarcaName, int, num } from '@/lib/format';

/**
 * Els itineraris de senderisme senyalitzats de Catalunya.
 *
 * ## Què hi ha i què no
 *
 * Els de xarxa nacional i regional: els GR i els PR-C, que són els que porten
 * marques de pintura, codi oficial i, gairebé tots, fitxa a la FEEC. Els de
 * xarxa local es queden fora — són itineraris municipals de pocs quilòmetres
 * que ningú no busca pel nom.
 *
 * ## La distància és la nostra i la cota també
 *
 * L'etiqueta `distance` d'OSM la tecleja qui mapa, i es nota: hi havia cinc
 * rutes seguides amb exactament «15.0 km». La que es publica es calcula de la
 * geometria. Les cotes surten del model d'elevació, a 57 m de píxel.
 *
 * El **desnivell acumulat** només surt quan OSM el porta. Amb un model de 57 m
 * el número sortiria curt i ningú no ho veuria.
 */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: 'Itineraris de senderisme senyalitzats de Catalunya',
  description:
    'Els GR i els PR-C de Catalunya amb la distància, les cotes per on passen i '
    + 'les comarques que travessen. Amb la predicció a l\'altura de cada itinerari.',
  alternates: { canonical: '/senderisme/rutes' },
};

export default function RutesPage() {
  const { routes, source, license, demZoom } = allRoutes();
  const comarques = new Map(allComarques().map((c) => [c.codi, c.nom]));

  const long = routes.filter((r) => r.network === 'nwn').length;
  const groups = groupsOf(routes, (r) => {
    const first = r.comarques[0];
    const nom = first ? comarques.get(first) : undefined;
    return first && nom ? { key: first, label: comarcaName(nom) } : null;
  });

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/senderisme" className="no-underline hover:text-[var(--ink)]">Muntanya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Itineraris</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Itineraris senyalitzats
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          {int(routes.length)} itineraris de gran i de petit recorregut, amb la distància
          calculada del traçat i les cotes per on passen. {int(long)} són de gran
          recorregut. Cada un porta la predicció a la seva altura, que és el que
          decideix si hi ha neu o pluja.
        </p>
      </header>

      <ListFilter id="fr" groups={groups} legend="Filtra per comarca d’inici" allLabel="Totes les comarques">
        <div className="scroll-x">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Itineraris senyalitzats de Catalunya, ordenats per codi
            </caption>
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Itinerari</th>
                <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Distància</th>
                <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Cotes</th>
                <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Per on passa</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr
                  key={r.slug}
                  data-lf={r.comarques[0] ?? undefined}
                  className="border-b border-[var(--line-soft)]"
                >
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/senderisme/rutes/${r.slug}`}
                      className="text-[var(--ink)] no-underline hover:underline"
                    >
                      {r.name}
                    </Link>
                    <span className="block text-xs text-[var(--muted)]">
                      {[refApart(r), networkLabel(r.network)].filter(Boolean).join(' · ')}
                      {r.roundtrip && ' · circular'}
                    </span>
                  </td>
                  <td className="tnum py-2.5 pr-4 text-[var(--ink-2)]">
                    {num(r.km, 1)} km
                    {r.ascentM != null && (
                      <span className="block text-xs text-[var(--muted)]">+{int(r.ascentM)} m</span>
                    )}
                  </td>
                  <td className="tnum py-2.5 pr-4 text-[var(--ink-2)]">
                    {r.minM != null && r.maxM != null ? `${int(r.minM)}–${int(r.maxM)} m` : '—'}
                  </td>
                  <td className="py-2.5 text-xs text-[var(--muted)]">
                    {r.comarques
                      .map((c) => { const n = comarques.get(c); return n ? comarcaName(n) : null; })
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(', ')}
                    {r.comarques.length > 3 && ` i ${r.comarques.length - 3} més`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ListFilter>

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Com es llegeix això
        </h2>
        <p>
          La distància es calcula del traçat, no de l&apos;etiqueta: la que porta OSM la
          tecleja qui mapa i sovint és rodona. Les cotes surten d&apos;un model
          d&apos;elevació amb un píxel de 57 m, així que un coll estret pot quedar uns
          metres per sota del que és.
        </p>
        <p>
          El desnivell acumulat només surt quan OSM el porta. Calcular-lo amb un model
          de 57 m donaria un número curt sense que es notés.
        </p>
        <p>
          Les marques de pintura i el manteniment són de les entitats excursionistes,
          i el traçat pot canviar sense que això ho sàpiga. Abans de sortir, val la pena
          mirar la fitxa oficial de l&apos;itinerari quan n&apos;hi ha.
        </p>
      </section>

      <footer className="mt-8 border-t border-[var(--line-soft)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
        <p>
          Traçats de{' '}
          <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" className="text-[var(--ink-2)]">
            {source} i els seus col·laboradors
          </a>
          , amb llicència {license}. Les cotes són calculades per nosaltres del model
          d&apos;elevació de Copernicus al zoom {demZoom}.
        </p>
      </footer>
    </article>
  );
}
