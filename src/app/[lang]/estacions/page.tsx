import type { Metadata } from 'next';
import Link from 'next/link';
import { altitudeColor, temperatureColor, temperatureInk } from '@/lib/scales';
import { capFirst, comarcaName, int, num, stationShort } from '@/lib/format';
import { fold, match } from '@/lib/search-match';
import { AMBITS, anchorSlug, groupByZone, zoneLabel } from '@/lib/zones';
import { allObservations } from '@/lib/weather';
import { allComarques, operativeStations, publishedPlaces } from '@/lib/territory';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero } from '@/components/PageHero';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';

/**
 * Índice de estaciones, agrupado por comarca.
 *
 * Es el mapa de la red sin mapa: dice cuántos termómetros hay de verdad y dónde,
 * que es la pregunta que un lector atento se hace en cuanto ve que este sitio
 * publica 4.293 puntos con 189 estaciones. Enseñar la densidad real —y las
 * comarcas que no tienen ninguna— vale más que esconderla.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

/*
 * El número va en el título, y por eso el título se calcula.
 *
 * Estaba escrito a mano —«Les 189 estacions»— y ese es el tipo de cifra que se
 * queda desactualizada sin que nada falle el día que el Meteocat desmantela una.
 */
export async function generateMetadata(): Promise<Metadata> {
  const n = operativeStations().length;
  const lang = await getLang();
  return {
    title: tr(lang, `Les ${n} estacions automàtiques de la XEMA`, `Las ${n} estaciones automáticas de la XEMA`),
    description: tr(lang,
      'Totes les estacions meteorològiques automàtiques de Catalunya en servei, '
      + 'per comarca, amb la seva altitud i la lectura més recent.',
      'Todas las estaciones meteorológicas automáticas de Cataluña en servicio, '
      + 'por comarca, con su altitud y la lectura más reciente.'),
    alternates: { canonical: '/estacions' },
  };
}

/** Quantes files ensenya el cercador abans de demanar que s'afini. */
const MAX_HITS = 40;

type Params = Promise<{ q?: string }>;

export default async function EstacionsPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const lang = await getLang();
  const es = lang === 'es';
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const ambitName = (name: string) => zoneLabel(name, lang);
  const stations = operativeStations();
  const obs = await allObservations();
  const tempOf = new Map(
    (obs?.data ?? []).map((o) => [o.station, o.values.temperature?.value ?? null]),
  );

  const comarques = allComarques();
  const byComarca = new Map(comarques.map((c) => [c.codi, [] as typeof stations]));
  const orphans: typeof stations = [];
  for (const s of stations) {
    const list = s.comarcaCodi ? byComarca.get(s.comarcaCodi) : undefined;
    if (list) list.push(s);
    else orphans.push(s);
  }

  const withStation = comarques.filter((c) => (byComarca.get(c.codi)?.length ?? 0) > 0);
  const without = comarques.filter((c) => (byComarca.get(c.codi)?.length ?? 0) === 0);

  const measured = stations.filter((s) => s.altitud != null);
  const highest = measured.reduce<typeof stations[number] | null>(
    (a, s) => (a == null || s.altitud! > a.altitud! ? s : a), null,
  );
  const lowest = measured.reduce<typeof stations[number] | null>(
    (a, s) => (a == null || s.altitud! < a.altitud! ? s : a), null,
  );
  const outline = mapOutline();

  // Les comarques, pels vuit àmbits del Pla territorial, com a Itineraris.
  const ambits = groupByZone(AMBITS, withStation, (c) => c.nom);

  // El cercador: el nom de l'estació, el poble on és, la comarca o el codi.
  const q = (params.q ?? '').trim().slice(0, 60);
  const fq = fold(q);
  const hits = fq
    ? stations
      .map((st) => ({
        st,
        score: Math.max(
          match(fq, stationShort(st.nom)),
          st.codi.toLowerCase() === fq ? 100 : 0,
          st.municipiNom ? Math.round(match(fq, st.municipiNom) * 0.8) : 0,
          st.comarcaNom ? Math.round(match(fq, comarcaName(st.comarcaNom, lang)) * 0.6) : 0,
        ),
      }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score || (b.st.altitud ?? 0) - (a.st.altitud ?? 0))
      .map((h) => h.st)
    : [];
  const suggestions = [...new Set([
    ...stations.map((st) => capFirst(stationShort(st.nom))),
    ...withStation.map((c) => comarcaName(c.nom, lang)),
  ])].sort((x, y) => x.localeCompare(y, lang));

  const row = (st: typeof stations[number], withComarca = false) => {
    const temp = tempOf.get(st.codi) ?? null;
    return (
      <li key={st.codi}>
        <Link href={`/estacions/${st.codi}`} className="row-main">
          <span className="row-title">{capFirst(stationShort(st.nom))}</span>
          <span className="row-sub tnum">
            {st.altitud != null ? `${int(st.altitud)} m` : '—'}
            {withComarca && st.comarcaNom && ` · ${comarcaName(st.comarcaNom, lang)}`} · {st.codi}
          </span>
        </Link>
        {temp != null && (
          <span
            className="temp-pill"
            style={{ background: temperatureColor(temp), color: temperatureInk(temp) }}
          >
            {num(temp, 0)}°
          </span>
        )}
      </li>
    );
  };

  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Estacions', 'Estaciones'), path: '/estacions' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('Estacions automàtiques', 'Estaciones automáticas')}
        icon="thermometer"
        title={t('Les estacions de la XEMA', 'Las estaciones de la XEMA')}
        lead={es ? (
          <>
            {stations.length} estaciones en servicio
            {highest && lowest && <>, entre {int(lowest.altitud)} y {int(highest.altitud)}&nbsp;m</>}.
            Cada una tiene su ficha, con los récords y las normales de su
            propia serie y de dónde le viene el viento.
          </>
        ) : (
          <>
            {stations.length} estacions en servei
            {highest && lowest && <>, entre {int(lowest.altitud)} i {int(highest.altitud)}&nbsp;m</>}.
            Cada una té la seva fitxa, amb els rècords i les normals de la seva
            pròpia sèrie i d&apos;on li ve el vent.
          </>
        )}
        stats={[
          {
            label: t('En servei', 'En servicio'), icon: 'thermometer', value: String(stations.length),
            sub: tr(lang, `a ${withStation.length} de ${comarques.length} comarques`, `en ${withStation.length} de ${comarques.length} comarcas`),
          },
          highest && {
            label: t('La més alta', 'La más alta'), icon: 'thermometer', value: int(highest.altitud), unit: 'm',
            sub: <Link href={`/estacions/${highest.codi}`}>{highest.nom}</Link>,
          },
          lowest && {
            label: t('La més baixa', 'La más baja'), icon: 'thermometer', value: int(lowest.altitud), unit: 'm',
            sub: <Link href={`/estacions/${lowest.codi}`}>{lowest.nom}</Link>,
          },
        ]}
        note={es ? (
          <>
            La web cubre {int(publishedPlaces())} poblaciones con{' '}
            {stations.length} termómetros: entre la estación y el pueblo siempre hay
            una corrección por desnivel, y cuanta más distancia y más desnivel, menos
            fiable es.
            {without.length > 0 && (
              <>
                {' '}{without.length === 1 ? 'Hay una comarca' : `Hay ${without.length} comarcas`}{' '}
                sin ninguna estación en servicio: {without.map((c) => comarcaName(c.nom, lang)).join(', ')}.
              </>
            )}
          </>
        ) : (
          <>
            El web cobreix {int(publishedPlaces())} poblacions amb{' '}
            {stations.length} termòmetres: entre l&apos;estació i el poble hi ha sempre
            una correcció per desnivell, i com més distància i més desnivell, menys
            fiable és.
            {without.length > 0 && (
              <>
                {' '}{without.length === 1 ? 'Hi ha una comarca' : `Hi ha ${without.length} comarques`}{' '}
                sense cap estació en servei: {without.map((c) => comarcaName(c.nom)).join(', ')}.
              </>
            )}
          </>
        )}
        aside={(
          /*
            La xarxa, abans de la llista per comarques.

            La pàgina deia «189 estacions entre 1 i 2.537 m» i llistava els noms
            agrupats per comarca. Amb el mapa es veu el que aquella frase no diu:
            que n'hi ha moltes al litoral i poques a l'interior del Pirineu, i per
            què una comarca es queda sense.

            El color és la cota i no la temperatura d'ara: aquesta última ja és el
            mapa de /rànquings, i repetir-la aquí seria la mateixa pàgina dues
            vegades. Aquí la pregunta és on hi ha termòmetres i a quina alçada.
          */
          <section className="card" aria-label={t("La xarxa d'estacions", 'La red de estaciones')}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              {t('La xarxa, per altitud', 'La red, por altitud')}
            </p>
            <PointsMap
              outline={outline.features}
              projection={outline.projection}
              width={outline.width}
              height={outline.height}
              maxHeight={400}
              scale={2}
              ariaLabel={tr(lang,
                `Mapa de Catalunya amb les ${stations.length} estacions de la XEMA en servei`,
                `Mapa de Cataluña con las ${stations.length} estaciones de la XEMA en servicio`)}
              points={stations.map((s) => ({
                key: s.codi,
                lat: s.lat,
                lon: s.lon,
                r: 5,
                fill: altitudeColor(s.altitud ?? 0),
                // Vint-i-quatre estacions ja porten la cota al nom —«Boí (2.537 m)»—
                // i afegint-la sortia dues vegades a la mateixa línia.
                tip: s.altitud != null && !/\(\s*[\d.]+\s*m\s*\)/.test(s.nom)
                  ? `${s.nom} · ${int(s.altitud)} m`
                  : s.nom,
              }))}
              footer={es ? (
                <>
                  Del verde de la llanura al blanco de la cima. Al pasar por encima de cada
                  punto aparecen el nombre y la cota.
                </>
              ) : (
                <>
                  Del verd de la plana al blanc del cim. Passant per sobre de cada
                  punt en surt el nom i la cota.
                </>
              )}
            />
          </section>
        )}
      />

      {/*
        El cercador de la pàgina, sense script, com el de /mar: el formulari
        torna aquí amb `?q=` i el servidor filtra.
      */}
      <form action="/estacions#cerca" method="get" role="search" id="cerca" className="mar-search mt-6">
        <label htmlFor="estacions-q" className="sr-only">{t('Cerca una estació, un poble o una comarca', 'Busque una estación, un pueblo o una comarca')}</label>
        <input
          id="estacions-q"
          name="q"
          type="search"
          defaultValue={q}
          list="estacions-noms"
          placeholder={t('Cerca una estació, un poble o una comarca', 'Busque una estación, un pueblo o una comarca')}
          autoComplete="off"
        />
        <button type="submit">{t('Cerca', 'Buscar')}</button>
        <datalist id="estacions-noms">
          {suggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      </form>

      {q && (
        <section className="mb-6" aria-label={tr(lang, `Resultats per ${q}`, `Resultados para ${q}`)}>
          <p className="card-label">
            {es
              ? hits.length > 0
                ? `${hits.length === 1 ? 'Una estación' : `${hits.length} estaciones`} para «${q}»`
                : `Ninguna estación se llama «${q}» ni está en un pueblo o una comarca que se llame así`
              : hits.length > 0
              ? `${hits.length === 1 ? 'Una estació' : `${hits.length} estacions`} per «${q}»`
              : `Cap estació no es diu «${q}» ni és en un poble o una comarca que es digui així`}
          </p>
          {hits.length > 0 && (
            <div className="card">
              <ul className="rows rows-cols">
                {hits.slice(0, MAX_HITS).map((st) => row(st, true))}
              </ul>
              {hits.length > MAX_HITS && (
                <p className="source">{es ? <>Hay {hits.length - MAX_HITS} más. Afine la búsqueda.</> : <>N&apos;hi ha {hits.length - MAX_HITS} més. Afineu la cerca.</>}</p>
              )}
            </div>
          )}
          <p className="card-foot"><Link href="/estacions">{t('Totes les estacions ›', 'Todas las estaciones ›')}</Link></p>
        </section>
      )}

      {/* Els àmbits, per saltar-hi. Són àncores: no cal cap script. */}
      <nav aria-label={t('Zones', 'Zonas')} className="mb-2">
        <ul className="chips">
          {ambits.map(([name, cs]) => (
            <li key={name}>
              <a href={`#zona-${anchorSlug(name)}`}>
                {ambitName(name)} <span>{cs.reduce((n, c) => n + (byComarca.get(c.codi)?.length ?? 0), 0)}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      {/*
        Comarca per comarca, dins del seu àmbit. En columnes i no en graella:
        les comarques van d'una estació a deu, i en una graella cada fila de
        targetes s'estira fins a la més llarga i deixa forats.
      */}
      {ambits.map(([name, cs]) => (
        <section
          key={name}
          id={`zona-${anchorSlug(name)}`}
          className="section scroll-mt-4"
          aria-labelledby={`h-${anchorSlug(name)}`}
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id={`h-${anchorSlug(name)}`} className="card-title">{ambitName(name)}</h2>
            <p className="text-[13px] text-[var(--muted)] tnum">
              {cs.length} {cs.length === 1 ? 'comarca' : t('comarques', 'comarcas')}
            </p>
          </div>
          <div className="gap-3 sm:columns-2 lg:columns-3">
            {cs.map((c) => {
              const list = (byComarca.get(c.codi) ?? [])
                .slice()
                .sort((a, b) => (b.altitud ?? 0) - (a.altitud ?? 0));
              return (
                <section key={c.codi} className="card mb-3 break-inside-avoid" aria-label={comarcaName(c.nom, lang)}>
                  <p className="card-label justify-between">
                    <Link href={c.path} className="text-[var(--ink-2)] no-underline hover:text-[var(--ink)] hover:underline">
                      {comarcaName(c.nom, lang)}
                    </Link>
                    <span className="tnum font-medium normal-case tracking-normal">
                      {list.length} {list.length === 1 ? t('estació', 'estación') : t('estacions', 'estaciones')}
                    </span>
                  </p>
                  <ul className="rows">{list.map((st) => row(st))}</ul>
                </section>
              );
            })}
          </div>
        </section>
      ))}

      {es ? (
        <p className="source mt-6">
          Temperatura de la última lectura de cada estación, sin corregir: es la del
          termómetro a su cota.
          {orphans.length > 0 && ` ${orphans.length} estaciones sin comarca asignada en el catálogo de origen.`}
        </p>
      ) : (
      <p className="source mt-6">
        Temperatura de l&apos;última lectura de cada estació, sense corregir: és la del
        termòmetre a la seva cota.
        {orphans.length > 0 && ` ${orphans.length} estacions sense comarca assignada al catàleg d'origen.`}
      </p>
      )}
    </article>
  );
}
