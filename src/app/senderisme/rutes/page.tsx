import type { Metadata } from 'next';
import Link from 'next/link';
import { allAxes, allRoutes, refApart, type Route } from '@/lib/routes';
import { allComarques } from '@/lib/territory';
import { comarcaName, deName, int, num } from '@/lib/format';
import { fold, match } from '@/lib/search-match';
import { mapOutline } from '@/lib/map';
import { PointsMap } from '@/components/PointsMap';
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
 *
 * ## Per zones i amb cercador
 *
 * Fins al 10 d'octubre de 2026 eren dues targetes —gran i petit recorregut—
 * amb un filtre de comarca plegat. Ara, com a `/mar`: un cercador que torna
 * aquí amb `?q=` i les files agrupades pels vuit àmbits del Pla territorial,
 * segons la comarca on comença cada itinerari. Llegir `searchParams` fa la
 * pàgina dinàmica; no costa res de més, perquè tot surt de `routes.json`, que
 * viatja amb el desplegament.
 */

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

/**
 * Els vuit àmbits funcionals del Pla territorial general, amb les 43 comarques.
 * Són els noms que fa servir la Generalitat i que qui camina ja coneix; una
 * divisió pròpia s'hauria d'explicar.
 */
const ZONES: Array<[string, string[]]> = [
  ['Alt Pirineu i Aran', ["Val d'Aran", 'Alta Ribagorça', 'Pallars Sobirà', 'Pallars Jussà', 'Alt Urgell', 'Cerdanya']],
  ['Comarques gironines', ['Alt Empordà', 'Baix Empordà', 'Garrotxa', 'Gironès', "Pla de l'Estany", 'Ripollès', 'Selva']],
  ['Comarques centrals', ['Bages', 'Berguedà', 'Lluçanès', 'Moianès', 'Osona', 'Solsonès']],
  ['Àmbit metropolità', ['Barcelonès', 'Baix Llobregat', 'Maresme', 'Vallès Occidental', 'Vallès Oriental']],
  ['Penedès', ['Alt Penedès', 'Baix Penedès', 'Garraf', 'Anoia']],
  ['Camp de Tarragona', ['Alt Camp', 'Baix Camp', 'Conca de Barberà', 'Priorat', 'Tarragonès']],
  ['Terres de l’Ebre', ['Baix Ebre', 'Montsià', "Ribera d'Ebre", 'Terra Alta']],
  ['Ponent', ['Garrigues', 'Noguera', "Pla d'Urgell", 'Segarra', 'Segrià', 'Urgell']],
];

const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * Un cercle per comarca i no un punt per itinerari: 683 punts eren uns cent
 * quilobytes de SVG, escrits dues vegades —HTML i càrrega RSC— per dir el
 * mateix que diuen 43 cercles.
 */
const DOT_FILL = 'oklch(80% 0.13 150)';

/** Quantes files ensenya el cercador abans de demanar que s'afini. */
const MAX_HITS = 60;

/** La cua d'etapa dels noms: « - E07», «. Etapa 3 : …». */
const STAGE = /(\s*[-–:.]\s*|\s+)(E|Etapa|Tram|Sector)\s*\d+\b.*$/i;

type Params = Promise<{ q?: string }>;

export default async function RutesPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const { routes, source, license, demZoom } = allRoutes();
  const axes = allAxes();
  const comarques = new Map(allComarques().map((c) => [c.codi, c.nom]));

  const long = routes.filter((r) => r.network === 'nwn');
  const short = routes.filter((r) => r.network !== 'nwn');
  const stages = axes.reduce((n, a) => n + a.legs.length, 0);

  // La zona és la de la comarca on comença, que és la primera de la llista.
  const zoneOf = (r: Route) => {
    const nom = r.comarques[0] ? comarques.get(r.comarques[0]) : undefined;
    return ZONES.find(([, cs]) => cs.includes(nom ?? ''))?.[0] ?? 'Altres';
  };
  const byName = (a: Route, b: Route) => a.name.localeCompare(b.name, 'ca');
  const zones = [...ZONES.map(([z]) => z), 'Altres']
    .map((z) => [z, routes.filter((r) => zoneOf(r) === z).sort(byName)] as [string, Route[]])
    .filter(([, list]) => list.length > 0);

  // El cercador: pel nom, pel codi, pels pobles d'inici i final i per les comarques.
  const q = (params.q ?? '').trim().slice(0, 60);
  const fq = fold(q);
  const hits = fq
    ? routes
      .map((r) => {
        const ends = [r.from, r.to].filter((t): t is string => Boolean(t));
        const names = r.comarques.map((c) => comarques.get(c)).filter((n): n is string => Boolean(n));
        const score = Math.max(
          match(fq, r.name),
          r.ref ? match(fq, r.ref) : 0,
          ...ends.map((t) => Math.round(match(fq, t) * 0.8)),
          ...names.map((n) => Math.round(match(fq, comarcaName(n)) * 0.6)),
        );
        return { r, score };
      })
      .filter((h) => h.score > 0)
      .sort((x, y) => y.score - x.score || byName(x.r, y.r))
      .map((h) => h.r)
    : [];
  const suggestions = [...new Set([
    ...axes.map((a) => a.ref),
    ...[...comarques.values()].map(comarcaName),
    // Sense l'etapa: «Senda Pirenaica - E07» una vegada i no quaranta-cinc.
    ...routes.map((r) => r.name.replace(STAGE, '')),
  ])].sort((x, y) => x.localeCompare(y, 'ca'));

  const outline = mapOutline();
  const starts = new Map<string, number>();
  for (const r of routes) if (r.comarques[0]) starts.set(r.comarques[0], (starts.get(r.comarques[0]) ?? 0) + 1);
  const perComarca = allComarques()
    .map((c) => ({ c, n: starts.get(c.codi) ?? 0 }))
    .filter(({ n }) => n > 0);

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
    <li key={r.slug}>
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
        aside={(
          <PointsMap
            scale={2}
            outline={outline.features}
            projection={outline.projection}
            width={outline.width}
            height={outline.height}
            values={false}
            ariaLabel={`Mapa de Catalunya amb l'inici dels ${routes.length} itineraris`}
            points={perComarca.map(({ c, n }) => ({
              key: c.codi,
              lat: c.lat,
              lon: c.lon,
              r: 2 + Math.sqrt(n) * 1.3,
              fill: DOT_FILL,
              tip: `${comarcaName(c.nom)}: ${n} ${n === 1 ? 'itinerari hi comença' : 'itineraris hi comencen'}`,
            }))}
            footer="Cada cercle, els itineraris que comencen a la comarca: com més gran, més n'hi ha."
          />
        )}
      />

      {/*
        El cercador de la pàgina, sense script, com el de /mar: el formulari
        torna aquí amb `?q=` i el servidor filtra.
      */}
      <form action="/senderisme/rutes#cerca" method="get" role="search" id="cerca" className="mar-search mt-6">
        <label htmlFor="rutes-q" className="sr-only">Cerca un itinerari, un codi o una comarca</label>
        <input
          id="rutes-q"
          name="q"
          type="search"
          defaultValue={q}
          list="rutes-noms"
          placeholder="Cerca un itinerari, un codi (GR 11) o una comarca"
          autoComplete="off"
        />
        <button type="submit">Cerca</button>
        <datalist id="rutes-noms">
          {suggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      </form>

      {q && (
        <section className="mb-6" aria-label={`Resultats per ${q}`}>
          <p className="card-label">
            {hits.length > 0
              ? `${hits.length === 1 ? 'Un itinerari' : `${int(hits.length)} itineraris`} per «${q}»`
              : `Cap itinerari no es diu «${q}» ni passa per una comarca que es digui així`}
          </p>
          {hits.length > 0 && (
            <div className="card">
              <ul className={ROWS} style={COLS}>
                {hits.slice(0, MAX_HITS).map(row)}
              </ul>
              {hits.length > MAX_HITS && (
                <p className="source">
                  N&apos;hi ha {int(hits.length - MAX_HITS)} més. Afineu la cerca: el nom o el
                  codi sencer troben l&apos;itinerari de seguida.
                </p>
              )}
            </div>
          )}
          <p className="card-foot"><Link href="/senderisme/rutes">Tots els itineraris ›</Link></p>
        </section>
      )}

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

      {/* Les zones, per saltar-hi. Són àncores: no cal cap script. */}
      <nav aria-label="Zones" className="mb-2 mt-8">
        <ul className="chips">
          {zones.map(([name, list]) => (
            <li key={name}><a href={`#zona-${slug(name)}`}>{name} <span>{list.length}</span></a></li>
          ))}
        </ul>
      </nav>

      {/*
        Els itineraris, zona per zona, segons la comarca on comencen. Dins de
        cada zona, per ordre alfabètic: el gran i el petit recorregut ja els
        diu el codi de la fila.
      */}
      {zones.map(([name, list]) => {
        const gr = list.filter((r) => r.network === 'nwn').length;
        return (
          <section key={name} id={`zona-${slug(name)}`} className="section scroll-mt-4" aria-labelledby={`h-${slug(name)}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`h-${slug(name)}`} className="card-title">{name}</h2>
              <p className="text-[13px] text-[var(--muted)] tnum">
                {int(list.length)} {list.length === 1 ? 'itinerari' : 'itineraris'}
                {gr > 0 && <> · {int(gr)} de gran recorregut</>}
              </p>
            </div>
            <div className="card">
              <ul className={ROWS} style={COLS}>
                {list.map(row)}
              </ul>
            </div>
          </section>
        );
      })}

      <p className="source mt-6">
        A la dreta de cada fila, la distància del traçat i, quan OpenStreetMap el porta, el
        desnivell acumulat. Traçats de{' '}
        <External href="https://www.openstreetmap.org/copyright" className="text-[var(--ink-2)]">
          {source} i els seus col·laboradors
        </External>
        , amb llicència {license}. Les cotes es calculen del model d&apos;elevació de
        Copernicus al zoom {demZoom}.
      </p>

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
