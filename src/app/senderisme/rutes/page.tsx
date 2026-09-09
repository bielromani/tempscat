import type { Metadata } from 'next';
import Link from 'next/link';
import { allAxes, allRoutes, networkLabel, refApart } from '@/lib/routes';
import { allComarques } from '@/lib/territory';
import { ListFilter, groupsOf } from '@/components/ListFilter';
import { comarcaName, int, num } from '@/lib/format';
import { External } from '@/components/External';

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
  const axes = allAxes();
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

      {/*
        Els eixos, abans de la llista de 683.

        Un GR llarg a OSM són moltes relacions amb el mateix codi —el GR 92 en
        són 33— i a la taula de sota surten com trenta-tres files seguides que
        no diuen que siguin la mateixa cosa. Qui busca «GR 92» busca l'eix, no
        l'etapa 17.
      */}
      {axes.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-semibold tracking-tight">Per codi, de punta a punta</h2>
          <p className="mb-3 max-w-[62ch] text-sm text-[var(--muted)]">
            {int(axes.reduce((n, a) => n + a.legs.length, 0))} dels itineraris són{' '}
            <strong className="font-medium text-[var(--ink-2)]">etapes</strong> d’un
            recorregut més llarg. Aquí van seguides i en ordre de caminar-les.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {axes.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/senderisme/rutes/eix/${a.slug}`}
                  className="flex items-baseline justify-between gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] px-4 py-3 no-underline hover:border-[var(--line)]"
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-[var(--ink)]">{a.ref}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {a.legs.length} etapes
                      {a.legs[0].from && ` · des ${a.legs[0].from}`}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-sm text-[var(--ink-2)]">{num(a.km, 0)} km</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          El desnivell acumulat només surt quan OSM el porta: calculat amb un model
          de 57 m sortiria curt.
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
          <External href="https://www.openstreetmap.org/copyright" className="text-[var(--ink-2)]">
            {source} i els seus col·laboradors
          </External>
          , amb llicència {license}. Les cotes es calculen del model
          d&apos;elevació de Copernicus al zoom {demZoom}.
        </p>
      </footer>
    </article>
  );
}
