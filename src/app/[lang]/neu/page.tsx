import type { Metadata } from 'next';
import Link from 'next/link';
import {
  aName, ago, capFirst, comarcaName, dateFull, dateShort, int, num, relativeDay, stationShort,
} from '@/lib/format';
import { MOUNTAIN_OTHER, MOUNTAIN_ZONES, anchorSlug, groupByZone } from '@/lib/zones';
import { allHistory, localToday } from '@/lib/weather';
import { stationByCodi } from '@/lib/territory';
import { mountainView } from '@/lib/mountain';
import { camerasByResort } from '@/lib/cameras';
import { ResortBlock } from '@/components/ResortBlock';
import { ResortMap, type ResortPin } from '@/components/ResortMap';
import { mapOutline } from '@/lib/map';
import { External } from '@/components/External';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';

/**
 * La nieve del Pirineo: medida, no estimada.
 *
 * Hasta ahora la nieve del sitio era la **cota** calculada a partir de la isocero
 * del modelo — una estimación. Esto es un espesor medido por un sensor, con su
 * fecha. Las dos juntas contestan la pregunta de verdad: «la cota va a 1.800 m i
 * a Bonaigua hi ha 40 cm».
 *
 * ## Por qué la página funciona también en agosto
 *
 * Un panel de nieve que en verano se queda vacío es una página muerta ocho meses
 * al año. Aquí, cuando no hay nieve, cada estación enseña **cuándo tuvo la
 * última** y **cuánta llegó a haber**: en agosto eso sigue siendo información, y
 * en enero pasa a segundo plano sin que haya que tocar nada.
 *
 * Solo 24 de las 189 estaciones tienen sensor de nieve. Las otras 165 no salen —
 * no con un cero, que es lo que pasaría si se confundiera «no mide» con «no hay».
 *
 * ## Y las seis estaciones de esquí, que miden otra cosa
 *
 * Un sensor de la XEMA mide el espesor en un punto; una estación de esquí
 * comunica el rango de sus pistas, cuánto tiene abierto y qué calidad tiene la
 * nieve. Son dos preguntas distintas —«cuánta nieve hay ahí» y «se puede
 * esquiar»— y por eso van en dos bloques.
 *
 * Las nueve estaciones meteorológicas de Ferrocarrils, además, cubren de 1.664
 * a 2.537 m, que es donde la XEMA tiene menos: son temperatura medida donde
 * antes solo había modelo.
 *
 * ## La cabecera (rediseño «Cel»)
 *
 * El mapa de las seis estaciones va a la derecha del título, y las cifras dicen
 * lo que se viene a mirar: cuántas están abiertas, dónde hay nieve medida y qué
 * temperatura hace arriba del todo. La temperatura sale de la estación
 * meteorológica **más alta con lectura vigente** — `mountain.stations` ya llega
 * ordenada de más alta a más baja y sin las paradas.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Gruix de neu al Pirineu, mesurat',
  description:
    'Quanta neu hi ha ara mateix a les estacions d\'alta muntanya de la XEMA: '
    + 'gruix mesurat, neu nova i rècords de cada estació.',
  alternates: { canonical: '/neu' },
};

export default async function NeuPage() {
  const today = localToday();
  const mountain = await mountainView();
  /*
   * Les càmeres van a la targeta aquí i **no a la fitxa d'un poble**: allà ja
   * hi ha el bloc de càmeres properes, i les mateixes dues fotografies dins de
   * la targeta de l'estació sortirien dos cops a la mateixa pàgina.
   */
  const camsByResort = await camerasByResort();

  /*
   * Els punts del mapa.
   *
   * La temperatura surt de l'estació meteorològica **més alta** del domini i
   * només si la mesura és vigent: una xifra de fa cinc hores dins d'un cercle
   * de colors es llegeix com si fos d'ara, i aquí no hi ha lloc per posar-hi
   * l'hora al costat. El gruix de neu, igual, amb el rellotge del comunicat.
   */
  const geo = mapOutline();
  const pins: ResortPin[] = (mountain?.resorts ?? []).map((r) => {
    const highest = (mountain?.stations ?? [])
      .filter((st) => st.bunitId === r.bunitId && st.current && st.temperature != null)
      .sort((a, b) => (b.altitudM ?? 0) - (a.altitudM ?? 0))[0];
    return {
      slug: r.slug,
      name: r.name,
      lat: r.lat,
      lon: r.lon,
      open: r.open,
      temperature: highest?.temperature ?? null,
      snowCm: r.reportUsable ? r.snowMaxCm : null,
    };
  });

  const rows = (await allHistory())
    .map((h) => {
      const station = stationByCodi(h.station);
      if (!station?.operativa || !h.snow) return null;
      return { h, station, snow: h.snow };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => {
      // Primero las que tienen nieve ahora; entre las que no, las más altas.
      if ((b.snow.depthCm > 0 ? 1 : 0) !== (a.snow.depthCm > 0 ? 1 : 0)) {
        return (b.snow.depthCm > 0 ? 1 : 0) - (a.snow.depthCm > 0 ? 1 : 0);
      }
      if (b.snow.depthCm !== a.snow.depthCm) return b.snow.depthCm - a.snow.depthCm;
      return (b.station.altitud ?? 0) - (a.station.altitud ?? 0);
    });

  const withSnow = rows.filter((r) => r.snow.depthCm > 0);
  // Per serralades, com a /senderisme; dins de cada una, l'ordre de dalt.
  const zones = groupByZone(MOUNTAIN_ZONES, rows, (r) => r.station.comarcaNom, MOUNTAIN_OTHER);

  const resorts = mountain?.resorts ?? [];
  const open = resorts.filter((r) => r.open);
  // La més alta amb lectura vigent: `stations` ja ve ordenada i sense les aturades.
  const top = mountain?.stations.find((s) => s.current && s.temperature != null) ?? null;
  // El gruix comunicat més alt, només dels comunicats que encara valen.
  const reported = resorts
    .filter((r) => r.reportUsable && r.snowMaxCm != null && r.snowMaxCm > 0)
    .sort((a, b) => (b.snowMaxCm ?? 0) - (a.snowMaxCm ?? 0))[0];

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Neu', path: '/neu' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Neu i muntanya"
        icon="snow"
        title="Quanta neu hi ha al Pirineu"
        lead={rows.length === 0 ? undefined : withSnow.length > 0 ? (
          <>
            <strong>
              {withSnow.length} {withSnow.length === 1 ? 'estació té' : 'estacions tenen'} neu
            </strong>{' '}
            ara mateix, de les {rows.length} que la mesuren. El gruix més alt és de{' '}
            <strong className="tnum">{int(withSnow[0].snow.depthCm)} cm</strong>,{' '}
            {aName(stationShort(withSnow[0].station.nom))}.
          </>
        ) : (
          <>
            Ara mateix <strong>no hi ha neu</strong> a cap de les {rows.length} estacions
            que la mesuren. A sota, quanta n&apos;hi ha arribat a haver a cada una.
          </>
        )}
        stats={[
          resorts.length > 0 && {
            label: 'Estacions obertes',
            icon: 'snow',
            value: int(open.length),
            unit: `de ${resorts.length}`,
            sub: open.length > 0 ? open.map((r) => r.name).join(', ') : 'Totes tancades',
          },
          reported && {
            label: 'Neu a les pistes',
            icon: 'extreme-snow',
            value: reported.snowMinCm != null && reported.snowMinCm !== reported.snowMaxCm
              ? `${int(reported.snowMinCm)}–${int(reported.snowMaxCm)}`
              : int(reported.snowMaxCm),
            unit: 'cm',
            sub: <><a href={`#e-${reported.slug}`}>{reported.name}</a> · comunicat {ago(reported.ageHours * 60)}</>,
          },
          withSnow.length > 0 && {
            label: 'Gruix mesurat',
            icon: 'snow',
            value: int(withSnow[0].snow.depthCm),
            unit: 'cm',
            sub: <Link href={`/estacions/${withSnow[0].station.codi}`}>{withSnow[0].station.nom}</Link>,
          },
          top && {
            label: 'Temperatura a dalt',
            icon: 'thermometer',
            value: num(top.temperature, 1),
            unit: '°C',
            sub: [
              top.altitudM != null && `${int(top.altitudM)} m`,
              top.resort,
              ago(top.ageMin),
            ].filter(Boolean).join(' · '),
          },
        ]}
        note={rows.length > 0 && (
          <>
            Gruix mesurat per un sensor, no la cota de neu estimada que surt a les fitxes:
            la cota diu per damunt de quina altura nevarà, i això, quanta n&apos;hi ha.
            Només {rows.length} estacions de la XEMA en servei porten sensor de neu.
          </>
        )}
        aside={pins.length > 0 && (
          <section className="card" aria-label="Les estacions d'esquí al mapa">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              Les estacions, ara
            </p>
            <ResortMap outline={geo.features} projection={geo.projection} pins={pins} />
            <p className="card-foot"><Link href="/cameres">Les càmeres de muntanya ›</Link></p>
          </section>
        )}
      />

      {/* Les seccions, per saltar-hi. Són àncores: no cal cap script. */}
      <nav aria-label="Seccions" className="mt-6 mb-2">
        <ul className="chips">
          {mountain && mountain.resorts.length > 0 && <li><a href="#estacions">Estacions d&apos;esquí</a></li>}
          {zones.map(([name, list]) => (
            <li key={name}><a href={`#zona-${anchorSlug(name)}`}>{name} <span>{list.length}</span></a></li>
          ))}
        </ul>
      </nav>

      {mountain && mountain.resorts.length > 0 && (
        <Section id="estacions" title="Les estacions d'esquí">
          <div className="card-grid">
            {mountain.resorts.map((r) => (
              <ResortBlock
                key={r.bunitId}
                resort={r}
                stations={mountain.stations.filter((st) => st.bunitId === r.bunitId)}
                cameras={camsByResort.get(r.bunitId) ?? []}
              />
            ))}
          </div>
          <p className="source">
            {mountain.attribution} ({mountain.license}). El comunicat el fa cada estació
            i el gruix de neu es retira quan passa de dos dies. El risc d&apos;allaus
            no surt d&apos;aquí: el butlletí oficial és el{' '}
            <External
              href="https://www.icgc.cat/ca/Ciutada/Explora-Catalunya/Allaus"
              className="text-[var(--ink-2)]"
            >
              butlletí de perill d&apos;allaus
            </External>{' '}
            de l&apos;ICGC amb el Meteocat.
          </p>
        </Section>
      )}

      {/*
        El gruix de cada sensor, serralada per serralada.

        Fins al 10 d'octubre de 2026 era una taula de cinc columnes que al mòbil
        calia arrossegar de costat. Ara, com a /mar: una targeta per estació amb
        el gruix, la neu nova i el rècord de la seva sèrie.
      */}
      {rows.length === 0 ? (
        <Section id="gruix" title="Gruix mesurat a les estacions de la XEMA">
          <div className="card">
            <p className="text-[var(--ink-2)]">
              Encara no hi ha dades de neu carregades. Torneu-hi en una estona.
            </p>
          </div>
        </Section>
      ) : (
        <>
          {zones.map(([name, list]) => {
            const snowy = list.filter((r) => r.snow.depthCm > 0);
            return (
              <section
                key={name}
                id={`zona-${anchorSlug(name)}`}
                className="section scroll-mt-4"
                aria-labelledby={`h-${anchorSlug(name)}`}
              >
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
                  <h2 id={`h-${anchorSlug(name)}`} className="card-title">{name}</h2>
                  <p className="text-[13px] text-[var(--muted)] tnum">
                    {list.length} {list.length === 1 ? 'sensor' : 'sensors'}
                    {' · '}
                    {snowy.length === 0
                      ? 'sense neu'
                      : `neu a ${snowy.length === list.length ? 'tots' : snowy.length}`}
                  </p>
                </div>
                <ul className="card-grid">
                  {list.map(({ h, station, snow }) => {
                    const rec = h.records.snowMax;
                    const when = relativeDay(snow.day, today) === 'avui' ? 'avui' : dateShort(snow.day);
                    return (
                      <li key={station.codi} className="card tram">
                        <h3 className="tram-name">
                          <Link
                            href={`/estacions/${station.codi}`}
                            className="text-[var(--ink)] no-underline hover:underline"
                          >
                            {capFirst(stationShort(station.nom))}
                          </Link>
                          <span className="block text-[12.5px] font-normal text-[var(--muted)]">
                            {station.altitud != null && <>{int(station.altitud)} m</>}
                            {station.comarcaNom && <> · {comarcaName(station.comarcaNom)}</>}
                          </span>
                        </h3>
                        <dl className="tram-now">
                          <div>
                            <dt>Gruix</dt>
                            <dd>
                              {snow.depthCm > 0 ? (
                                <span
                                  className="temp-pill"
                                  style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                                >
                                  {int(snow.depthCm)} cm
                                </span>
                              ) : <span className="text-[var(--muted)]">0 cm</span>}
                              <small>{when}</small>
                            </dd>
                          </div>
                          <div>
                            <dt>Neu nova</dt>
                            <dd>
                              {snow.newCm != null && snow.newCm > 0
                                ? <span className="text-[var(--good)]">+{int(snow.newCm)} cm</span>
                                : <span className="text-[var(--muted)]">—</span>}
                            </dd>
                          </div>
                          <div>
                            <dt>Rècord</dt>
                            <dd>
                              {rec ? <>{int(rec.value)} cm</> : '—'}
                              {rec && <small>{dateFull(rec.date)}</small>}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          <p className="source mt-6">
            Servei Meteorològic de Catalunya (XEMA), gruix màxim diari al punt del sensor.
            El rècord és el de la sèrie de cada estació, que arrenca quan es va instal·lar el
            sensor i no quan es va instal·lar l&apos;estació.
          </p>
        </>
      )}

      <div className="mt-10">
        <Fold title="Què vol dir i què no" summary="Un punt concret, no l'estat de les pistes">
          <div className="card prose">
            <p>
              El gruix és el <strong>màxim del dia</strong> al punt on hi ha el sensor,
              normalment planer. A cinquanta metres, en un obac o en una congesta,
              n&apos;hi pot haver el doble; en una carena escombrada pel vent, gens.
            </p>
            <p>
              <strong>No és l&apos;estat de les pistes.</strong> Les estacions d&apos;esquí
              fabriquen neu, la compacten i l&apos;acumulen: el gruix d&apos;una pista no té
              gaire a veure amb el d&apos;un prat a la mateixa cota. Per a això hi ha el
              comunicat de cada estació, a dalt.
            </p>
            <p>
              <strong>Hi ha lectures que es descarten.</strong> El sensor és un ultrasò
              que mesura la distància fins a terra, i a l&apos;estiu s&apos;hi cola
              qualsevol cosa: herba que creix, un objecte, una recalibració. El registre
              donava 12 cm de neu a Das el 28 d&apos;agost, a 1.100 m, amb la mínima a
              9,3 °C, i el portal les marcava com a bones. Es descarta el gruix que
              augmenta un dia que no ha glaçat; la neu que es fon un dia de sol es queda.
            </p>
          </div>
        </Fold>
      </div>
    </article>
  );
}
