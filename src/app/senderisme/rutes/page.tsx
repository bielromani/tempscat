import type { Metadata } from 'next';
import Link from 'next/link';
import { allAxes, allRoutes, refApart, type Route } from '@/lib/routes';
import { allComarques } from '@/lib/territory';
import { ListFilter, groupsOf } from '@/components/ListFilter';
import { comarcaName, deName, int, num } from '@/lib/format';
import { External } from '@/components/External';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';

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
 *
 * ## La llista pesa el que pesa cada fila, 683 vegades
 *
 * Era una taula amb quatre columnes i una classe llarga a cada cel·la: 1,2 MB
 * d'HTML i 49 pantalles a l'escriptori. Ara són files en tres columnes dins de
 * dues targetes —gran i petit recorregut, que és el que la fila deia a cada
 * línia— i **les files no porten cap classe**: l'estil el posa la llista als
 * seus fills (`ROWS`), un cop. Cada caràcter d'una fila surt dues vegades
 * —a l'HTML i a la càrrega RSC— i 683 vegades cada una.
 */
export const revalidate = 86_400;

export const metadata: Metadata = {
  title: 'Itineraris de senderisme senyalitzats de Catalunya',
  description:
    'Els GR i els PR-C de Catalunya amb la distància, les cotes per on passen i '
    + 'les comarques que travessen. Amb la predicció a l\'altura de cada itinerari.',
  alternates: { canonical: '/senderisme/rutes' },
};

/*
 * L'estil de les files, escrit un cop a la llista i no 683 vegades a cada fila.
 *
 * El nom va en `<b>`, la línia de sota en `<small>` i la distància en el
 * `<span>` de la dreta. No es fan servir `.row-title` ni `.row-sub` perquè
 * tallen el text amb punts suspensius, i en tres columnes estretes es
 * menjaven la meitat dels noms i les comarques; aquí el nom baixa de línia.
 */
const ROWS = [
  'rows rows-cols',
  '[&_a]:min-w-0',
  '[&_b]:block [&_b]:text-[15px] [&_b]:font-[550] [&_b]:leading-snug',
  '[&_small]:mt-0.5 [&_small]:block [&_small]:text-[12.5px] [&_small]:font-normal [&_small]:leading-snug',
  '[&_small]:text-[var(--muted)]',
  '[&>li>span]:shrink-0 [&>li>span]:self-start [&>li>span]:text-right [&>li>span]:text-[15px]',
  '[&>li>span]:font-semibold [&>li>span]:tabular-nums',
].join(' ');

/** Tres columnes on hi caben: la llista és llarga i els noms, no gaire. */
const COLS = { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 19rem), 1fr))' };

export default function RutesPage() {
  const { routes, source, license, demZoom } = allRoutes();
  const axes = allAxes();
  const comarques = new Map(allComarques().map((c) => [c.codi, c.nom]));

  const long = routes.filter((r) => r.network === 'nwn');
  const short = routes.filter((r) => r.network !== 'nwn');
  const stages = axes.reduce((n, a) => n + a.legs.length, 0);
  const groups = groupsOf(routes, (r) => {
    const first = r.comarques[0];
    const nom = first ? comarques.get(first) : undefined;
    return first && nom ? { key: first, label: comarcaName(nom) } : null;
  });

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Muntanya', path: '/senderisme' },
    { nom: 'Itineraris', path: '/senderisme/rutes' },
  ];

  const places = (r: Route) => {
    const names = r.comarques
      .map((c) => { const n = comarques.get(c); return n ? comarcaName(n) : null; })
      .filter(Boolean);
    return names.slice(0, 3).join(', ') + (names.length > 3 ? ` i ${names.length - 3} més` : '');
  };

  const row = (r: Route) => (
    <li key={r.slug} data-lf={r.comarques[0] ?? undefined}>
      <Link href={`/senderisme/rutes/${r.slug}`}>
        <b>{r.name}</b>
        <small>
          {[
            refApart(r),
            r.roundtrip && 'circular',
            r.minM != null && r.maxM != null && `${int(r.minM)}–${int(r.maxM)} m`,
            places(r),
          ].filter(Boolean).join(' · ')}
        </small>
      </Link>
      <span>
        {num(r.km, 1)} km
        {r.ascentM != null && <small>+{int(r.ascentM)} m</small>}
      </span>
    </li>
  );

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Senderisme"
        icon="partly-cloudy-day"
        title="Itineraris senyalitzats"
        lead={(
          <>
            Els GR i els PR-C de Catalunya, cadascun amb la <strong>predicció a la seva
            altura</strong>: és la que decideix si a dalt hi haurà neu o pluja.
          </>
        )}
        stats={[
          { label: 'Itineraris', value: int(routes.length) },
          { label: 'Gran recorregut', value: int(long.length) },
          { label: 'Petit recorregut', value: int(short.length) },
          axes.length > 0 && {
            label: 'Eixos', value: int(axes.length), sub: `${int(stages)} etapes, en ordre`,
          },
        ]}
        note={(
          <>
            La distància es calcula del traçat i les cotes, del model d&apos;elevació de
            Copernicus. Traçats d&apos;OpenStreetMap, amb llicència {license}.
          </>
        )}
      />

      {/*
        Els eixos, abans de la llista de 683.

        Un GR llarg a OSM són moltes relacions amb el mateix codi —el GR 92 en
        són 33— i a la llista de sota surten com trenta-tres files seguides que
        no diuen que siguin la mateixa cosa. Qui busca «GR 92» busca l'eix, no
        l'etapa 17.
      */}
      {axes.length > 0 && (
        <Section id="eixos" title="Per codi, de punta a punta">
          <ul className="card-grid cols-4">
            {axes.map((a) => (
              <li key={a.slug}>
                <Link href={`/senderisme/rutes/eix/${a.slug}`} className="card h-full">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold">{a.ref}</span>
                    <span className="tnum shrink-0 text-lg font-semibold">
                      {num(a.km, 0)}<small className="ml-1 text-sm font-medium text-[var(--muted)]">km</small>
                    </span>
                  </span>
                  <span className="mt-1 block text-[13px] leading-snug text-[var(--muted)]">
                    {a.legs.length} etapes
                    {a.legs[0].from && ` · des ${deName(a.legs[0].from)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="source measure">
            {int(stages)} dels itineraris són etapes d&apos;un recorregut més llarg. A la
            pàgina de cada eix van seguides i en ordre de caminar-les.
          </p>
        </Section>
      )}

      <Section id="tots" title={`Els ${int(routes.length)} itineraris`}>
        <ListFilter id="fr" groups={groups} legend="Filtra per comarca d’inici" allLabel="Totes les comarques">
          {[
            { key: 'gr', label: 'Gran recorregut', list: long },
            { key: 'pr', label: 'Petit recorregut', list: short },
          ].filter((g) => g.list.length > 0).map((g) => (
            <section key={g.key} className="lf-section card card-block" aria-labelledby={`h-${g.key}`}>
              <h3 id={`h-${g.key}`} className="card-label">
                {g.label} <span className="lf-total tnum">· {int(g.list.length)}</span>
              </h3>
              <ul className={ROWS} style={COLS}>
                {g.list.map(row)}
              </ul>
            </section>
          ))}
        </ListFilter>
        <p className="source">
          A la dreta, la distància del traçat i, quan OpenStreetMap el porta, el desnivell
          acumulat. Traçats de{' '}
          <External href="https://www.openstreetmap.org/copyright" className="text-[var(--ink-2)]">
            {source} i els seus col·laboradors
          </External>
          , amb llicència {license}. Les cotes es calculen del model d&apos;elevació de
          Copernicus al zoom {demZoom}.
        </p>
      </Section>

      <div className="folds">
        <Fold title="Com es llegeix això" summary="La distància, les cotes i el desnivell">
          <div className="card prose">
            <p>
              La distància es calcula del traçat, no de l&apos;etiqueta d&apos;OpenStreetMap,
              que la tecleja qui mapa i sovint és rodona. Les cotes surten d&apos;un model
              d&apos;elevació amb un píxel de 57 m: un coll estret pot quedar uns metres per
              sota del que és.
            </p>
            <p>
              El desnivell acumulat només surt quan OpenStreetMap el porta: calculat amb un
              model de 57 m sortiria curt.
            </p>
            <p>
              Les marques de pintura i el manteniment són de les entitats excursionistes, i
              el traçat pot canviar. Abans de sortir, consulteu la fitxa oficial de
              l&apos;itinerari quan n&apos;hi ha.
            </p>
          </div>
        </Fold>
      </div>
    </article>
  );
}
