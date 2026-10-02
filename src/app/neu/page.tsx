import type { Metadata } from 'next';
import Link from 'next/link';
import { aName, ago, dateFull, dateShort, int, num, relativeDay } from '@/lib/format';
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
            {aName(withSnow[0].station.nom)}.
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

      <Section id="gruix" title="Gruix mesurat a les estacions de la XEMA">
        {rows.length === 0 ? (
          <div className="card">
            <p className="text-[var(--ink-2)]">
              Encara no hi ha dades de neu carregades. Torneu-hi en una estona.
            </p>
          </div>
        ) : (
          <div className="card">
            <div className="scroll-x">
              <table className="data-table">
                <caption className="sr-only">
                  Gruix de neu mesurat a cada estació de la XEMA amb sensor, i el rècord de la sèrie
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Estació</th>
                    <th scope="col" className="num">Altitud</th>
                    <th scope="col">Gruix</th>
                    <th scope="col">Mesurat</th>
                    <th scope="col">Rècord de la sèrie</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ h, station, snow }) => {
                    const rec = h.records.snowMax;
                    return (
                      <tr key={station.codi}>
                        <td>
                          <Link href={`/estacions/${station.codi}`} className="font-medium">
                            {station.nom}
                          </Link>
                          {station.comarcaNom && (
                            <span className="block text-xs text-[var(--muted)]">{station.comarcaNom}</span>
                          )}
                        </td>
                        <td className="num whitespace-nowrap text-[var(--muted)]">
                          {station.altitud != null ? `${int(station.altitud)} m` : '—'}
                        </td>
                        <td className="tnum whitespace-nowrap">
                          {snow.depthCm > 0 ? (
                            <span
                              className="temp-pill"
                              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                            >
                              {int(snow.depthCm)} cm
                            </span>
                          ) : (
                            <span className="text-[var(--muted)]">sense neu</span>
                          )}
                          {snow.newCm != null && snow.newCm > 0 && (
                            <span className="ml-2 text-xs text-[var(--good)]">
                              +{int(snow.newCm)} de nova
                            </span>
                          )}
                        </td>
                        <td className="tnum whitespace-nowrap text-[var(--muted)]">
                          {relativeDay(snow.day, today) === 'avui'
                            ? 'avui'
                            : dateShort(snow.day)}
                        </td>
                        <td className="tnum whitespace-nowrap text-[var(--muted)]">
                          {rec ? `${int(rec.value)} cm · ${dateFull(rec.date)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="source">
              Servei Meteorològic de Catalunya (XEMA), gruix màxim diari. La sèrie de
              cada estació arrenca quan es va instal·lar el sensor, que no és quan es va
              instal·lar l&apos;estació.
            </p>
          </div>
        )}
      </Section>

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
