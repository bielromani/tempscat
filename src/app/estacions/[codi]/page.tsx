import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ClimateBlock } from '@/components/ClimateBlock';
import { WindRose } from '@/components/WindRose';
import { PointsMap } from '@/components/PointsMap';
import { Fold } from '@/components/Fold';
import { msToKmh, windCardinal } from '@/lib/variables';
import {
  aName, ago, comarcaName, dateFull, deName, fromDirection, int, num, signed,
} from '@/lib/format';
import { historyOfStation, localToday, measuredRainOf, observationOfStation } from '@/lib/weather';
import { dryStreakOf, withMeasuredRain } from '@/lib/recent-rain';
import {
  climateOfStation, rainYearsOf, sameMonthAcrossYears, trendOf, yearsOf,
  MONTH_MIN_DAYS, TREND_MIN_YEARS,
} from '@/lib/climate';
import { ClimateTrend } from '@/components/ClimateTrend';
import { allComarques, operativeStations, stationByCodi } from '@/lib/territory';
import { mapOutline } from '@/lib/map';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

/**
 * Ficha de estación. 189 rutas operativas.
 *
 * Publica datos que ya estaban descargados y que no se veían en ninguna parte:
 * `xema-history.json` lleva desde el principio los récords absolutos, las
 * normales mes a mes calculadas sobre la propia serie, los contadores del año y
 * los últimos 45 días — y todo eso solo asomaba, resumido, dentro de la ficha de
 * un municipio.
 *
 * La diferencia entre esta página y la de un municipio es una y hay que decirla:
 * **aquí no hay ninguna corrección**. Es la lectura del termómetro, en su cota y
 * en su emplazamiento. En una ficha de pueblo la temperatura viene corregida por
 * el desnivel; aquí no hace falta corregir nada porque el dato es de este punto
 * exacto.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

type Params = Promise<{ codi: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { codi } = await params;
  const s = stationByCodi(codi);
  if (!s) return {};
  return {
    title: `Estació ${deName(s.nom)} · ${s.comarcaNom ?? 'Catalunya'}`,
    description: `Dades de l'estació automàtica ${deName(s.nom)} (XEMA, codi ${s.codi}), `
      + `a ${s.altitud != null ? `${Math.round(s.altitud)} m` : 'cota desconeguda'}: `
      + 'rècords, normals mensuals, rosa dels vents i els últims 45 dies.',
    alternates: { canonical: `/estacions/${s.codi}` },
  };
}

/**
 * «des del 7 de novembre» però «des de l'1 de gener» i «de l'11»: el dia es
 * llegeix «u» i «onze». `deName()` és per a topònims, i davant d'una data feia
 * «des de 7 de novembre».
 */
function since(iso: string): string {
  const day = iso.slice(8, 10);
  return `des ${day === '01' || day === '11' ? "de l'" : 'del '}${dateFull(iso)}`;
}

/** Una fila de la fitxa tècnica: el nom a sobre, petit, i la dada a sota. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li>
      <span className="row-main">
        <span className="row-sub">{label}</span>
        <span className="mt-0.5 block text-[15px] font-medium text-[var(--ink)]">{children}</span>
      </span>
    </li>
  );
}

export default async function EstacioPage({ params }: { params: Params }) {
  const { codi } = await params;
  const station = stationByCodi(codi);
  if (!station || !station.operativa) notFound();

  const history = await historyOfStation(station.codi);

  const obs = await observationOfStation(station.codi);
  const today = localToday();
  const month = Number(today.slice(5, 7));

  // Els dies sense pluja, comptats fins avui: el de `history` s'acaba on s'acaba
  // la sèrie diària, dos dies enrere. Ver `recent-rain.ts`.
  const dryStreak = history
    ? dryStreakOf(withMeasuredRain(history.daily, await measuredRainOf(station.codi)))
    : null;

  /*
   * La sèrie mensual, que viu al seu propi tros.
   *
   * No és al de l'històric a posta: aquell el llegeixen les 4.293 fitxes de
   * poble i cap no ensenya això. Ver `shards.ts`.
   */
  const monthly = await climateOfStation(station.codi);
  const climateYears = monthly ? yearsOf(monthly) : [];
  /*
   * Els anys de pluja van a part dels de temperatura.
   *
   * Quatre estacions de la XEMA només mesuren pluja —el Pantà de Sau, Sant
   * Joan de les Abadesses, la Roca del Vallès i Navès— i, demanant-los la
   * mitjana de temperatura, aquesta secció no els ensenyava res: Sau en porta
   * 368 mesos sencers, trenta anys de pluviòmetre, i la pàgina els callava per
   * la manca d'una dada que allí no es mesura.
   */
  const rainYears = monthly ? rainYearsOf(monthly) : [];
  /** Els anys que donen el rang de la sèrie: els de temperatura si n'hi ha. */
  const span: Array<{ year: number }> = climateYears.length >= 5 ? climateYears : rainYears;
  const trend = trendOf(climateYears);
  const monthSeries = monthly ? sameMonthAcrossYears(monthly, month) : [];
  const monthNow = monthly?.find((m) => m.ym === today.slice(0, 7)) ?? null;

  const t = obs?.values.temperature?.value ?? null;
  const wind = obs?.values.wind_speed?.value ?? null;
  const gust = obs?.values.wind_gust?.value ?? null;
  const dir = obs?.values.wind_direction?.value ?? null;
  const humidity = obs?.values.humidity?.value ?? null;
  const pressure = obs?.values.pressure?.value ?? null;

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Estacions', path: '/estacions' },
    { nom: station.nom, path: `/estacions/${station.codi}` },
  ];
  const comarca = station.comarcaCodi
    ? allComarques().find((c) => c.codi === station.comarcaCodi)
    : undefined;
  const outline = mapOutline();

  /*
   * La xifra gran, com a la fitxa d'un lloc: l'enter a mida de titular i el
   * decimal al costat, petit. El decimal és d'un termòmetre i per això hi és;
   * un «,0» no diu res i no s'escriu. Es parteix la cadena ja formatada, i no
   * el número, perquè el signe menys i el −0,4 surtin bé.
   */
  const showAlt = station.altitud != null && !/\(\s*[\d.]+\s*m\s*\)/.test(station.nom);
  const [whole, decimal] = t != null ? num(t, 1).split(',') : [null, null];
  const tMax = obs?.today?.tMax ?? null;
  const tMin = obs?.today?.tMin ?? null;

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow={`Estació automàtica de la XEMA · ${station.codi}`}
        icon="thermometer"
        title={station.nom}
        lead={(
          <>
            <p className="text-[15px] text-[var(--muted)]">
              {/* Vint-i-quatre estacions ja porten la cota al nom —«Malniu (2.229
                  m)»— i al títol i aquí sortia dues vegades seguides. */}
              {[
                showAlt && `${int(station.altitud)} m d'altitud`,
                comarca
                  ? (
                    <Link key="c" href={comarca.path} className="text-[inherit] no-underline hover:text-[var(--ink)] hover:underline">
                      {comarcaName(comarca.nom)}
                    </Link>
                  )
                  : station.comarcaNom,
                station.emplacament,
              ].filter(Boolean).map((bit, i) => (
                <span key={i}>{i > 0 && ' · '}{bit}</span>
              ))}
            </p>

            {whole != null ? (
              <div className="mt-4 flex items-start text-[var(--ink)]">
                <span className="tnum text-[96px] font-extralight leading-[0.86] tracking-[-0.06em] sm:text-[120px]">
                  {whole}
                </span>
                <span className="mt-2 text-[30px] font-light sm:text-[36px]">
                  {decimal && decimal !== '0' ? `,${decimal}` : ''}°
                </span>
              </div>
            ) : (
              <p className="mt-4 text-[var(--ink-2)]">
                {obs ? "L'última lectura no porta temperatura." : 'Sense cap lectura recent.'}
              </p>
            )}
            {(tMax != null || tMin != null) && (
              <p className="tnum mt-3 text-[19px] font-semibold text-[var(--ink)]">
                {[
                  tMax != null && `Màx. ${num(tMax, 1)}°`,
                  tMin != null && `Mín. ${num(tMin, 1)}°`,
                ].filter(Boolean).join(' · ')}
                <span className="font-normal text-[var(--ink-2)]"> avui</span>
              </p>
            )}
          </>
        )}
        stats={obs ? [
          wind != null && {
            label: 'Vent', icon: 'wind', value: msToKmh(wind).toFixed(0), unit: 'km/h',
            sub: dir != null ? `Ve ${fromDirection(windCardinal(dir))}` : undefined,
          },
          gust != null && {
            label: 'Ratxa', icon: 'wind', value: msToKmh(gust).toFixed(0), unit: 'km/h',
          },
          humidity != null && {
            label: 'Humitat', icon: 'humidity', value: String(Math.round(humidity)), unit: '%',
          },
          obs.precip24h != null && {
            label: 'Pluja · 24 h', icon: 'raindrop', value: num(obs.precip24h, 1), unit: 'mm',
          },
          pressure != null && {
            label: 'Pressió', icon: 'barometer', value: int(pressure), unit: 'hPa',
            sub: "A l'estació, no reduïda al nivell del mar",
          },
          obs.yesterday?.tMax != null && {
            label: "Màxima d'ahir", icon: 'thermometer', value: num(obs.yesterday.tMax, 1), unit: '°C',
          },
        ] : undefined}
        note={(
          /*
            La aclaración que separa esta página de la de un municipio. Va arriba y
            no en una nota al pie: es la diferencia entre un dato medido y uno
            calculado.
          */
          <>
            {obs && `Lectura ${ago(obs.ageMin)}, provisional fins que la validi el Meteocat. `}
            És la lectura del termòmetre, sense cap correcció: a les fitxes de poble
            la temperatura es corregeix pel desnivell entre el poble i la seva
            estació de referència; aquí és la d&apos;aquest punt, a{' '}
            {station.altitud != null ? `${int(station.altitud)} m` : 'la seva cota'}.
          </>
        )}
        aside={(
          <section className="card" aria-label={`On és l'estació ${deName(station.nom)}`}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              On és, dins de la xarxa
            </p>
            <PointsMap
              outline={outline.features}
              projection={outline.projection}
              width={outline.width}
              height={outline.height}
              maxHeight={380}
              scale={2}
              ariaLabel={`Mapa de Catalunya amb l'estació ${deName(station.nom)} marcada entre les de la XEMA`}
              points={operativeStations().map((s) => (s.codi === station.codi
                ? { key: s.codi, lat: s.lat, lon: s.lon, r: 8, fill: 'var(--accent)', tip: s.nom }
                : { key: s.codi, lat: s.lat, lon: s.lon, r: 2.5, fill: 'var(--surface-2)', tip: s.nom }))}
            />
            {station.nearestLocation && (
              <p className="card-foot text-[var(--ink-2)]">
                El nucli habitat més proper és{' '}
                <Link href={station.nearestLocation.path}>{station.nearestLocation.nom}</Link>,
                a {num(station.nearestLocation.distKm, 1)} km.
              </p>
            )}
          </section>
        )}
      />

      {history?.rose && (
        <Section id="vent" title="D'on ve el vent">
          <div className="card">
            <WindRose rose={history.rose} />
          </div>
        </Section>
      )}

      {history && (
        <Section id="clima" title="Clima i rècords">
          <ClimateBlock
            history={history}
            station={{
              codi: station.codi,
              nom: station.nom,
              distKm: 0,
              dAltM: 0,
            }}
            month={month}
            today={today}
            dryStreak={dryStreak ?? undefined}
            withRose={false}
          />
        </Section>
      )}

      {/*
        L'àncora és la que fa servir el bloc de clima de les 4.293 fitxes de
        poble: la frase de allí situa el mes en curs entre els seus germans i
        aquesta secció és la continuació natural. On queda el mes no es repeteix
        aquí —ho diu el mateix bloc, tres pantalles amunt d'aquesta— i el
        gràfic del mes ja el marca amb la barra ressaltada.
      */}
      {(climateYears.length >= 5 || rainYears.length >= 5) && (
        <Section id="anys" title="Com han anat els anys" className="scroll-mt-20">
          <p className="-mt-1 mb-4 measure text-[15px] text-[var(--ink-2)]">
            {span.length} anys sencers mesurats aquí, de {span[0].year} a{' '}
            {span[span.length - 1].year}
            {climateYears.length < 5 ? ', de pluja: aquí no es mesura la temperatura' : ''}.
          </p>

          <ClimateTrend
            years={climateYears}
            rainYears={rainYears}
            trend={trend}
            month={month}
            monthSeries={monthSeries}
            monthNow={monthNow}
            monthly={monthly ?? []}
          />

          <p className="source measure">
            És el que ha mesurat aquest aparell, no el clima de la comarca: una
            estació es mou, canvia de sensor i li creixen cases al voltant, i
            qualsevol de les tres coses mou una sèrie tant com una dècada.
          </p>
        </Section>
      )}

      <Section id="fitxa" title="Fitxa tècnica">
        <div className="card">
          <ul className="rows rows-cols">
            <Fact label="Codi XEMA">{station.codi}</Fact>
            <Fact label="Altitud">
              {station.altitud != null ? `${int(station.altitud)} m` : '—'}
            </Fact>
            <Fact label="Coordenades">
              <span className="tnum">{num(station.lat, 4)}, {num(station.lon, 4)}</span>
            </Fact>
            <Fact label="En servei des de">
              {station.dataInici ? dateFull(station.dataInici) : '—'}
            </Fact>
            {history?.records.since && (
              <Fact label="Sèrie diària">
                {since(history.records.since)} · {int(history.records.days)} dies
              </Fact>
            )}
            {station.municipiNom && (
              <Fact label="Municipi">{station.municipiNom}</Fact>
            )}
            {/* Només quan no hi ha la comparació amb els mateixos dies d'altres anys,
                que és la xifra de «Clima i rècords»: les dues juntes diferien unes
                dècimes —Tàrrega, +3,9 i +3,8— i semblava un error. */}
            {history?.monthAnomaly != null && !history.monthProgress && (
              <Fact label="Aquest mes, contra la normal">
                <span className="tnum">{signed(history.monthAnomaly, 1, '°C')}</span>
              </Fact>
            )}
            {history != null && (
              <Fact label="Dies sense pluja">
                <span className="tnum">{dryStreak}</span>
              </Fact>
            )}
          </ul>
          <p className="source">
            Dades del Servei Meteorològic de Catalunya (XEMA), via el portal de dades
            obertes de la Generalitat. Les normals i els rècords es calculen sobre la
            sèrie d&apos;aquesta mateixa estació, no sobre cap reanàlisi ni cap mitjana
            regional: valen per {aName(station.nom)} i no per la comarca.
          </p>
        </div>
      </Section>

      {(climateYears.length >= 5 || rainYears.length >= 5) && (
        <div className="section">
          <Fold title="Com es fan aquests càlculs" summary="Quins anys i quins mesos hi entren, i per què una recta">
            <div className="card prose">
              <p>
                Hi entren els anys amb els dotze mesos mesurats, i els mesos amb{' '}
                {MONTH_MIN_DAYS} dies o més. Un mes amb quatre dies de dada no es
                compara amb un de sencer, i un any al qual li falta un mes surt{' '}
                {climateYears.length >= 5 ? 'més càlid si el que li falta és el gener' : 'més sec'}.
              </p>
              <p>
                {trend
                  ? `La recta és la de mínims quadrats sobre aquests ${trend.years} anys, i no la diferència entre el primer i l'últim: amb dos punts, un any excepcional a qualsevol extrem decideix el resultat sencer.`
                  : climateYears.length < 5
                    ? "No hi ha tendència de temperatura perquè aquesta estació no en mesura: només hi ha pluviòmetre. La pluja no en porta, de recta: la d'un any no marca la del següent com ho fa la temperatura."
                    : `No es dibuixa cap tendència: en calen ${TREND_MIN_YEARS} anys sencers i aquí n'hi ha ${climateYears.length}. Amb menys, el pendent d'una sèrie de temperatures és soroll amb un signe.`}
              </p>
            </div>
          </Fold>
        </div>
      )}
    </article>
  );
}
