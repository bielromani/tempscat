import type { Metadata } from 'next';
import Link from 'next/link';
import { rankings, type PlaceRow, type StationRow } from '@/lib/rankings';
import { PointsMap } from '@/components/PointsMap';
import { TemperatureLegend } from '@/components/TemperatureMap';
import { mapOutline } from '@/lib/map';
import { sourceText } from '@/lib/sea';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import {
  aName, ago, capFirst, comarcaName, dateLong, deName, int, num, placeName, signed, stationShort,
} from '@/lib/format';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';
import { alternatesFor } from '@/lib/site';

/**
 * Ránquings del día.
 *
 * Es la página más compartible del sitio y la que menos cuesta: los datos ya
 * están en el snapshot de la XEMA que alimenta las 4.293 fichas, así que esto es
 * ordenar en memoria y nada más. Cero llamadas, cero cuota.
 *
 * Diez minutos de revalidación, la cadencia del worker de observación. Poner
 * menos no traería datos nuevos; poner más haría mentir al «ara mateix».
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang,
      'Rànquings del dia · el poble més fred i el més càlid de Catalunya',
      'Rankings del día · el pueblo más frío y el más cálido de Cataluña'),
    description: tr(lang,
      'On ha fet més fred i més calor avui a Catalunya: extrems de les estacions '
      + 'automàtiques de la XEMA, amplitud tèrmica, pluja acumulada i ratxes de vent.',
      'Dónde ha hecho más frío y más calor hoy en Cataluña: extremos de las estaciones '
      + 'automáticas de la XEMA, amplitud térmica, lluvia acumulada y rachas de viento.'),
    alternates: alternatesFor('/ranquings'),
  };
}

const trailOf = (lang: Lang) => [
  { nom: tr(lang, 'Catalunya', 'Cataluña'), path: '/' },
  { nom: tr(lang, 'Rànquings', 'Rankings'), path: '/ranquings' },
];

/** El número de la posició, a l'esquerra de cada fila. */
function Rank({ n }: { n: number }) {
  return (
    <span className="tnum w-5 shrink-0 text-center text-[13px] font-semibold text-[var(--muted)]">{n}</span>
  );
}

/** Una temperatura dins de la seva píndola de color. */
function Pill({ value }: { value: number }) {
  return (
    <span className="temp-pill" style={{ background: temperatureColor(value), color: temperatureInk(value) }}>
      {num(value, 1)}°
    </span>
  );
}

/** Lista de estaciones. El valor lleva el color de la escala cuando es temperatura. */
function StationList({
  rows, unit, decimals = 1, colored = false, empty, lang,
}: {
  rows: StationRow[];
  unit: string;
  decimals?: number;
  colored?: boolean;
  empty: string;
  lang: Lang;
}) {
  if (!rows.length) return <p className="text-sm text-[var(--muted)]">{empty}</p>;

  return (
    <ol className="rows">
      {rows.map((r, i) => (
        <li key={r.codi}>
          <span className="flex min-w-0 items-center gap-3">
            <Rank n={i + 1} />
            <span className="row-main">
              <Link href={`/estacions/${r.codi}`} className="row-title">{capFirst(stationShort(r.nom))}</Link>
              <span className="row-sub">
                {r.comarcaNom && comarcaName(r.comarcaNom, lang)}
                {r.altitud != null && ` · ${int(r.altitud)}\u00a0m`}
                {r.note && ` · ${r.note}`}
                {r.path && r.placeNom && (
                  <>
                    {' · '}
                    <Link
                      href={r.path}
                      title={tr(lang,
                        `El temps ${aName(r.placeNom)}, a ${num(r.distKm ?? 0, 1)} km de l'estació`,
                        `El tiempo ${aName(r.placeNom, lang)}, a ${num(r.distKm ?? 0, 1)} km de la estación`)}
                    >
                      {placeName(r.placeNom, lang)} ›
                    </Link>
                  </>
                )}
              </span>
            </span>
          </span>
          {colored
            ? <Pill value={r.value} />
            : (
              <span className="row-value">
                {num(r.value, decimals)}
                <small className="ml-1 text-xs font-normal text-[var(--muted)]">{unit}</small>
              </span>
            )}
        </li>
      ))}
    </ol>
  );
}

function PlaceList({ rows, lang }: { rows: PlaceRow[]; lang: Lang }) {
  return (
    <ol className="rows">
      {rows.map((r, i) => (
        <li key={r.id}>
          <span className="flex min-w-0 items-center gap-3">
            <Rank n={i + 1} />
            <span className="row-main">
              <Link href={r.path} className="row-title">{placeName(r.nom, lang)}</Link>
              <span className="row-sub">
                {r.comarcaNom && comarcaName(r.comarcaNom, lang)}
                {r.altitud != null && ` · ${int(r.altitud)}\u00a0m`}
                {!r.estimated && <>{' · '}{tr(lang, 'estació ', 'estación ')}{deName(stationShort(r.stationNom), lang)}</>}
                {!r.estimated && r.dAltM != null && Math.abs(r.dAltM) >= 25 && ` (${signed(r.dAltM, 0, 'm')})`}
              </span>
            </span>
          </span>
          <Pill value={r.value} />
        </li>
      ))}
    </ol>
  );
}

/** Una llista dins de la seva targeta: la icona, el títol i, si cal, de quan compta. */
function Block({
  title, icon, hint, children,
}: { title: string; icon: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card" aria-label={title}>
      <h3 className="card-label">
        {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
        <img src={`/icons/w/${icon}.svg`} width={22} height={22} alt="" />
        {title}
      </h3>
      {hint && <p className="-mt-2 mb-3 text-[13px] leading-snug text-[var(--muted)]">{hint}</p>}
      {children}
    </section>
  );
}

export default async function RanquingsPage() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const TRAIL = trailOf(lang);
  const r = await rankings();

  if (!r) {
    return (
      <article>
        <JsonLd data={graph(breadcrumbLd(TRAIL, lang))} />
        <PageHero
          crumbs={TRAIL}
          eyebrow={t('Rànquings de Catalunya', 'Rankings de Cataluña')}
          icon="thermometer"
          title={t("Els extrems d'avui", 'Los extremos de hoy')}
          lead={(
            <>
              {t('Encara no hi ha cap observació carregada. Els rànquings apareixen tan aviat com arriba la primera lectura de la XEMA.',
                'Todavía no hay ninguna observación cargada. Los rankings aparecen en cuanto llega la primera lectura de la XEMA.')}
            </>
          )}
        />
      </article>
    );
  }

  const outline = mapOutline();
  const cold = r.stations.nowColdest[0];
  const warm = r.stations.nowWarmest[0];
  const hottest = r.stations.dayMax[0];
  const rain = r.stations.rain[0];
  const rain24 = r.stations.rain24;
  const gust = r.stations.gust[0];
  const short = (x: StationRow) => capFirst(stationShort(x.nom));
  const es = lang === 'es';

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(TRAIL, lang))} />

      <PageHero
        crumbs={TRAIL}
        eyebrow={t('Rànquings de Catalunya', 'Rankings de Cataluña')}
        icon="thermometer"
        title={t("Els extrems d'avui", 'Los extremos de hoy')}
        lead={cold && warm ? (es ? (
          <>
            Ahora hace más frío {aName(stationShort(cold.nom), lang)}, con{' '}
            <strong className="tnum">{num(cold.value, 1)} °C</strong>, y más calor{' '}
            {aName(stationShort(warm.nom), lang)}, con <strong className="tnum">{num(warm.value, 1)} °C</strong>:{' '}
            {num(warm.value - cold.value, 0)} grados de diferencia.
            {rain
              ? <> Hoy donde más ha llovido es {aName(stationShort(rain.nom), lang)}, {num(rain.value, 1)} mm.</>
              : rain24
                ? <> Desde medianoche no ha llovido en ninguna parte; en las últimas 24 horas, donde más ha llovido es {aName(stationShort(rain24.nom), lang)}, {num(rain24.value, 1)} mm.</>
                : ' Hace un día que no llueve en ninguna estación.'}
          </>
        ) : (
          <>
            Ara fa més fred {aName(stationShort(cold.nom))}, amb{' '}
            <strong className="tnum">{num(cold.value, 1)} °C</strong>, i més calor{' '}
            {aName(stationShort(warm.nom))}, amb <strong className="tnum">{num(warm.value, 1)} °C</strong>:{' '}
            {num(warm.value - cold.value, 0)} graus de diferència.
            {rain
              ? <> Avui on més ha plogut és {aName(stationShort(rain.nom))}, {num(rain.value, 1)} mm.</>
              : rain24
                ? <> Des de la mitjanit no ha plogut enlloc; en les últimes 24 hores, on més ha plogut és {aName(stationShort(rain24.nom))}, {num(rain24.value, 1)} mm.</>
                : ' Fa un dia que no plou en cap estació.'}
          </>
        )) : undefined}
        note={es ? (
          <>
            {r.stations.total} estaciones automáticas de la XEMA con dato reciente,{' '}
            {dateLong(r.day, lang)}.
            {r.ageMin != null && (r.ageMin < 1
              ? ' La lectura más reciente es de ahora mismo'
              : ` La lectura más reciente es de ${ago(r.ageMin, lang)}`)}
            {r.ageMin != null ? ': la' : ' La'} XEMA publica con
            45 a 65 minutos de retraso, así que «ahora mismo» quiere decir la última media
            hora cerrada, no este instante.
          </>
        ) : (
          <>
            {r.stations.total} estacions automàtiques de la XEMA amb dada recent,{' '}
            {dateLong(r.day)}.
            {r.ageMin != null && (r.ageMin < 1
              ? " La lectura més recent és d'ara mateix"
              : ` La lectura més recent és de ${ago(r.ageMin)}`)}
            {r.ageMin != null ? ': la' : ' La'} XEMA publica amb
            45 a 65 minuts de retard, així que «ara mateix» vol dir l&apos;última mitja
            hora tancada, no aquest instant.
          </>
        )}
        aside={r.now.length > 0 && (
          /*
            On fa fred i on fa calor, abans de les llistes.

            La pàgina ensenyava els deu extrems de cada llista, i amb deu números
            no es veu **on**: que el fred sigui al Pirineu i la calor a Ponent és
            la meitat de la resposta d'aquesta pàgina, i era la meitat que no hi
            era. Hi van les 187 amb dada, no els extrems, perquè el que un mapa
            contesta és el repartiment.

            Sense rètols: 187 noms superposats amaguen exactament el que el mapa
            hauria d'ensenyar. Cada punt porta el seu al `title`.
          */
          <section className="card" aria-label={t('La temperatura de cada estació, ara', 'La temperatura de cada estación, ahora')}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              {t('Ara a Catalunya', 'Ahora en Cataluña')}
            </p>
            <PointsMap
              outline={outline.features}
              projection={outline.projection}
              width={outline.width}
              height={outline.height}
              maxHeight={380}
              scale={2}
              ariaLabel={tr(lang,
                `Mapa de Catalunya amb la temperatura de les ${r.now.length} estacions ara mateix`,
                `Mapa de Cataluña con la temperatura de las ${r.now.length} estaciones ahora mismo`)}
              points={r.now.map((s) => ({
                key: s.codi,
                lat: s.lat,
                lon: s.lon,
                fill: temperatureColor(s.t),
                tip: `${s.nom}: ${num(s.t, 1)} °C`,
              }))}
            />
            <TemperatureLegend lang={lang} />
            {es ? (
              <p className="source">
                Cada punto es una estación con la lectura de ahora, sin corregir por el
                desnivel: las de montaña salen frías porque están ahí.
              </p>
            ) : (
              <p className="source">
                Cada punt és una estació amb la lectura d&apos;ara, sense corregir pel
                desnivell: les de muntanya surten fredes perquè hi són.
              </p>
            )}
          </section>
        )}
      >
        {/*
          Els dos titulars, en vidre i amb el color de la pròpia temperatura a la
          vora i al fons, com la franja d'un avís porta el del seu nivell. El
          número va en blanc: el color de l'escala és per a fons, i sobre el blau
          de nit un 3 °C blau fosc no es llegiria.
        */}
        {cold && warm && (
          <ul className="stat-grid mt-6">
            {[
              { label: t('Ara, el més fred', 'Ahora, el más frío'), row: cold },
              { label: t('Ara, el més càlid', 'Ahora, el más cálido'), row: warm },
            ].map(({ label, row }) => {
              const c = temperatureColor(row.value);
              return (
                <li
                  key={label}
                  className="stat"
                  style={{ borderColor: c, background: `color-mix(in oklch, ${c} 16%, transparent)` }}
                >
                  <p className="stat-label">
                    {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
                    <img src="/icons/w/thermometer.svg" width={20} height={20} alt="" />
                    {label}
                  </p>
                  <p className="stat-value tnum">{num(row.value, 1)}<small>°C</small></p>
                  <div className="stat-sub">
                    <Link href={`/estacions/${row.codi}`} className="font-semibold">{short(row)}</Link>
                    <span className="block text-[var(--muted)]">
                      {row.comarcaNom && comarcaName(row.comarcaNom, lang)}
                      {row.altitud != null && ` · ${int(row.altitud)} m`}
                    </span>
                    {row.path && row.placeNom && (
                      <Link href={row.path} className="mt-1 block" style={{ color: 'var(--accent)' }}>
                        {t('El temps ', 'El tiempo ')}{aName(row.placeNom, lang)} ›
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
            {hottest && (
              <li className="stat">
                <p className="stat-label">
                  {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
                  <img src="/icons/w/thermometer.svg" width={20} height={20} alt="" />
                  {t("Màxima d'avui", 'Máxima de hoy')}
                </p>
                <p className="stat-value tnum">{num(hottest.value, 1)}<small>°C</small></p>
                <p className="stat-sub">
                  <Link href={`/estacions/${hottest.codi}`}>{short(hottest)}</Link>
                </p>
              </li>
            )}
            {gust && (
              <li className="stat">
                <p className="stat-label">
                  {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
                  <img src="/icons/w/wind.svg" width={20} height={20} alt="" />
                  {t('Ratxa més forta', 'Racha más fuerte')}
                </p>
                <p className="stat-value tnum">{num(gust.value, 0)}<small>km/h</small></p>
                <p className="stat-sub">
                  <Link href={`/estacions/${gust.codi}`}>{short(gust)}</Link>
                </p>
              </li>
            )}
          </ul>
        )}
      </PageHero>

      {/* Les seccions, per saltar-hi. Són àncores: no cal cap script. */}
      <nav aria-label={t('Seccions', 'Secciones')} className="mt-6 mb-2">
        <ul className="chips">
          <li><a href="#temperatura">{t('Temperatura', 'Temperatura')}</a></li>
          <li><a href="#pluja-vent">{t('Pluja i vent', 'Lluvia y viento')}</a></li>
          <li><a href="#pobles">{t('Als pobles', 'En los pueblos')}</a></li>
        </ul>
      </nav>

      {/*
        Fins al 10 d'octubre de 2026 eren sis llistes seguides sota «Extrems del
        dia», amb la més freda d'ara i sense la més càlida. Ara van per tema, i
        les d'ara mateix fan parella.
      */}
      <Section id="temperatura" title={t('Temperatura', 'Temperatura')}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <Block title={t('Ara, les més fredes', 'Ahora, las más frías')} icon="thermometer">
            <StationList rows={r.stations.nowColdest} unit="°C" colored empty={t('Sense observació.', 'Sin observación.')} lang={lang} />
          </Block>
          <Block title={t('Ara, les més càlides', 'Ahora, las más cálidas')} icon="thermometer">
            <StationList rows={r.stations.nowWarmest} unit="°C" colored empty={t('Sense observació.', 'Sin observación.')} lang={lang} />
          </Block>
          <Block title={t("Màximes més altes d'avui", 'Máximas más altas de hoy')} icon="thermometer" hint={t('Des de la mitjanit', 'Desde medianoche')}>
            <StationList rows={r.stations.dayMax} unit="°C" colored empty={t('Encara no hi ha màximes del dia.', 'Todavía no hay máximas del día.')} lang={lang} />
          </Block>
          <Block title={t("Mínimes més baixes d'avui", 'Mínimas más bajas de hoy')} icon="thermometer" hint={t('Des de la mitjanit', 'Desde medianoche')}>
            <StationList rows={r.stations.dayMin} unit="°C" colored empty={t('Encara no hi ha mínimes del dia.', 'Todavía no hay mínimas del día.')} lang={lang} />
          </Block>
          <Block
            title={t('Més diferència entre la màxima i la mínima', 'Más diferencia entre la máxima y la mínima')}
            icon="thermometer"
            hint={t("L'amplitud del dia: gran terra endins, petita a la costa", 'La amplitud del día: grande tierra adentro, pequeña en la costa')}
          >
            <StationList rows={r.stations.range} unit="°C" empty={t('Encara no es pot calcular.', 'Todavía no se puede calcular.')} lang={lang} />
          </Block>
        </div>
      </Section>

      <Section id="pluja-vent" title={t('Pluja i vent', 'Lluvia y viento')}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <Block title={t('Més pluja', 'Más lluvia')} icon="raindrops" hint={t('Acumulada des de la mitjanit', 'Acumulada desde medianoche')}>
            <StationList
              rows={r.stations.rain}
              unit="mm"
              lang={lang}
              empty={rain24
                ? tr(lang,
                  `Des de la mitjanit no ha plogut en cap estació. En les últimes 24 hores, on més ha plogut és ${aName(stationShort(rain24.nom))}, ${num(rain24.value, 1)} mm.`,
                  `Desde medianoche no ha llovido en ninguna estación. En las últimas 24 horas, donde más ha llovido es ${aName(stationShort(rain24.nom), lang)}, ${num(rain24.value, 1)} mm.`)
                : t('No ha plogut en cap estació en les últimes 24 hores.', 'No ha llovido en ninguna estación en las últimas 24 horas.')}
            />
          </Block>
          <Block title={t('Ratxes més fortes', 'Rachas más fuertes')} icon="wind" hint={t("La de l'última lectura, no la del dia", 'La de la última lectura, no la del día')}>
            <StationList rows={r.stations.gust} unit="km/h" decimals={0} empty={t('Sense dades de ratxa.', 'Sin datos de racha.')} lang={lang} />
          </Block>
        </div>
      </Section>

      <Section id="pobles" title={t('Als pobles', 'En los pueblos')}>
        {es ? (
          <p className="-mt-1 mb-4 measure text-[15px] leading-relaxed text-[var(--ink-2)]">
            Aquí son poblaciones, no termómetros: la temperatura del modelo en cada
            municipio, corregida con lo que marcan las estaciones del entorno. Es una{' '}
            <strong className="font-semibold text-[var(--ink)]">estimación</strong>, no una medida.{' '}
            <Link href="/dades/encert" className="underline">Cuánto acierta</Link>.
          </p>
        ) : (
          <p className="-mt-1 mb-4 measure text-[15px] leading-relaxed text-[var(--ink-2)]">
            Aquí són poblacions, no termòmetres: la temperatura del model a cada
            municipi, corregida amb el que marquen les estacions del voltant. És una{' '}
            <strong className="font-semibold text-[var(--ink)]">estimació</strong>, no una mesura.{' '}
            <Link href="/dades/encert" className="underline">Quant encerta</Link>.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <Block title={t('Els municipis més frescos ara', 'Los municipios más frescos ahora')} icon="thermometer">
            <PlaceList rows={r.places.coldest} lang={lang} />
          </Block>
          <Block title={t('Els municipis més càlids ara', 'Los municipios más cálidos ahora')} icon="thermometer">
            <PlaceList rows={r.places.warmest} lang={lang} />
          </Block>
        </div>
        {es ? (
          <p className="source measure">
            Observaciones de {sourceText(r.source, lang)}. En la clasificación de municipios entran{' '}
            {int(r.places.total)} de los 947.
            {r.places.excluded > 0 && (
              <>
                {' '}Se han dejado fuera {int(r.places.excluded)} puntos que tienen más de
                300 m de desnivel respecto a su estación: por encima de ese
                umbral el gradiente térmico estándar ya no describe la diferencia real
                entre el pueblo y su estación.
              </>
            )}
          </p>
        ) : (
          <p className="source measure">
            Observacions de {r.source}. A la classificació de municipis hi entren{' '}
            {int(r.places.total)} dels 947.
            {r.places.excluded > 0 && (
              <>
                {' '}S&apos;han deixat fora {int(r.places.excluded)} punts que tenen més de
                300 m de desnivell respecte de la seva estació: per damunt d&apos;aquest
                llindar el gradient tèrmic estàndard ja no descriu la diferència real
                entre el poble i la seva estació.
              </>
            )}
          </p>
        )}
      </Section>
    </article>
  );
}
