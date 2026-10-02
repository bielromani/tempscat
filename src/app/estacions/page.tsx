import type { Metadata } from 'next';
import Link from 'next/link';
import { altitudeColor, temperatureColor, temperatureInk } from '@/lib/scales';
import { comarcaName, int, num } from '@/lib/format';
import { allObservations } from '@/lib/weather';
import { allComarques, operativeStations, publishedPlaces } from '@/lib/territory';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

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
  return {
    title: `Les ${n} estacions automàtiques de la XEMA`,
    description:
      'Totes les estacions meteorològiques automàtiques de Catalunya en servei, '
      + 'per comarca, amb la seva altitud i la lectura més recent.',
    alternates: { canonical: '/estacions' },
  };
}

export default async function EstacionsPage() {
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

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Estacions', path: '/estacions' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Estacions automàtiques"
        icon="thermometer"
        title="Les estacions de la XEMA"
        lead={(
          <>
            {stations.length} estacions en servei
            {highest && lowest && <>, entre {int(lowest.altitud)} i {int(highest.altitud)}&nbsp;m</>}.
            Cada una té la seva fitxa, amb els rècords i les normals de la seva
            pròpia sèrie i d&apos;on li ve el vent.
          </>
        )}
        stats={[
          {
            label: 'En servei', icon: 'thermometer', value: String(stations.length),
            sub: `a ${withStation.length} de ${comarques.length} comarques`,
          },
          highest && {
            label: 'La més alta', icon: 'thermometer', value: int(highest.altitud), unit: 'm',
            sub: <Link href={`/estacions/${highest.codi}`}>{highest.nom}</Link>,
          },
          lowest && {
            label: 'La més baixa', icon: 'thermometer', value: int(lowest.altitud), unit: 'm',
            sub: <Link href={`/estacions/${lowest.codi}`}>{lowest.nom}</Link>,
          },
        ]}
        note={(
          <>
            El web cobreix {publishedPlaces().toLocaleString('ca-ES')} poblacions amb{' '}
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
          <section className="card" aria-label="La xarxa d'estacions">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              La xarxa, per altitud
            </p>
            <PointsMap
              outline={outline.features}
              projection={outline.projection}
              width={outline.width}
              height={outline.height}
              maxHeight={400}
              scale={2}
              ariaLabel={`Mapa de Catalunya amb les ${stations.length} estacions de la XEMA en servei`}
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
              footer={(
                <>
                  Del verd de la plana al blanc del cim. Passant per sobre de cada
                  punt en surt el nom i la cota.
                </>
              )}
            />
          </section>
        )}
      />

      <Section id="comarques" title="Per comarca">
        {/*
          En columnes i no en graella: les comarques van d'una estació a deu, i
          en una graella cada fila de targetes s'estira fins a la més llarga i
          deixa forats. Les columnes les apilen.
        */}
        <div className="gap-3 sm:columns-2 lg:columns-3">
          {withStation.map((c) => {
            const list = (byComarca.get(c.codi) ?? [])
              .slice()
              .sort((a, b) => (b.altitud ?? 0) - (a.altitud ?? 0));
            return (
              <section key={c.codi} className="card mb-3 break-inside-avoid" aria-label={comarcaName(c.nom)}>
                <p className="card-label justify-between">
                  <Link href={c.path} className="text-[var(--ink-2)] no-underline hover:text-[var(--ink)] hover:underline">
                    {comarcaName(c.nom)}
                  </Link>
                  <span className="tnum font-medium normal-case tracking-normal">
                    {list.length} {list.length === 1 ? 'estació' : 'estacions'}
                  </span>
                </p>
                <ul className="rows">
                  {list.map((s) => {
                    const t = tempOf.get(s.codi) ?? null;
                    return (
                      <li key={s.codi}>
                        <Link href={`/estacions/${s.codi}`} className="row-main">
                          <span className="row-title">{s.nom}</span>
                          <span className="row-sub tnum">
                            {s.altitud != null ? `${int(s.altitud)} m` : '—'} · {s.codi}
                          </span>
                        </Link>
                        {t != null && (
                          <span
                            className="temp-pill"
                            style={{ background: temperatureColor(t), color: temperatureInk(t) }}
                          >
                            {num(t, 0)}°
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="source">
          Temperatura de l&apos;última lectura de cada estació, sense corregir: és la
          del termòmetre a la seva cota.
          {orphans.length > 0 && ` ${orphans.length} estacions sense comarca assignada al catàleg d'origen.`}
        </p>
      </Section>
    </article>
  );
}
