import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { comarcaBySlug, municipisOfComarca } from '@/lib/territory';
import { activeWarnings, currentFor, forecastFor } from '@/lib/weather';
import { comarcaSummary } from '@/lib/comparison';
import { temperatureMap } from '@/lib/map';
import { TemperatureMap } from '@/components/TemperatureMap';
import {
  aComarca, aName, aNameParts, comarcaName, dateLong, dateShort, deComarca, int, num, placeName,
  relativeDayTiny, temp,
} from '@/lib/format';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';
import { WeatherIcon } from '@/components/WeatherIcon';
import { withObservedToday } from '@/components/LocationView';
import { localToday } from '@/lib/weather';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

/** Página de comarca: 43 rutas. */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

type Params = Promise<{ comarca: string }>;

/** Els dies de la taula de predicció: més enllà, a la fitxa de cada lloc. */
const FORECAST_DAYS = 4;

/**
 * «El temps al» · «Bages»: la preposició s'emporta l'article. En castellà, el
 * mateix amb «en el» · «Bages», «en la» · «Selva», i Osona sola.
 */
function titleParts(nom: string, lang: Lang): { prep: string; rest: string } {
  if (lang !== 'es') return aNameParts(comarcaName(nom));
  const full = comarcaName(nom, lang);
  const m = /^(el|la|las) (.+)$/.exec(full);
  return m ? { prep: `en ${m[1]}`, rest: m[2] } : { prep: 'en', rest: full };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { comarca } = await params;
  const c = comarcaBySlug(comarca);
  if (!c) return {};
  const lang = await getLang();
  if (lang === 'es') {
    return {
      title: `El tiempo ${aComarca(c.nom, lang)} · ${c.nMunicipis} municipios`,
      description: `Temperatura actual y predicción para los ${c.nMunicipis} municipios ${deComarca(c.nom, lang)}, `
        + `con datos de las estaciones automáticas del Meteocat.`,
      alternates: { canonical: c.path },
    };
  }
  return {
    title: `El temps ${aName(comarcaName(c.nom))} · ${c.nMunicipis} municipis`,
    description: `Temperatura actual i predicció per als ${c.nMunicipis} municipis ${deComarca(c.nom)}, `
      + `amb dades de les estacions automàtiques del Meteocat.`,
    alternates: { canonical: c.path },
  };
}

export default async function ComarcaPage({ params }: { params: Params }) {
  const { comarca } = await params;
  const c = comarcaBySlug(comarca);
  if (!c) notFound();
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const es = lang === 'es';

  const municipis = municipisOfComarca(c.codi);
  const summary = await comarcaSummary(c.codi);
  const map = await temperatureMap();
  const warnings = (await activeWarnings()).filter((w) => w.comarcaCodis.includes(c.codi));
  const today = localToday();

  // Observación actual de cada municipio. Sale de la misma instantánea, así que
  // la primera lectura la trae y las otras 67 la encuentran ya en memoria.
  const rows = await Promise.all(
    municipis.map(async (m) => ({ m, current: await currentFor(m) })),
  );
  const conTemp = rows.filter((r) => r.current?.temperatureAdjusted != null);

  /*
   * La predicció, de pocs municipis i no de tots.
   *
   * Un resum de la comarca seria una mitjana de llocs que no s'assemblen: la
   * Cerdanya va de Bellver a la Molina. Els que surten són els cinc on viu més
   * gent i, si queda fora, el més alt, perquè és el que fa un altre temps. Tots
   * són del mateix tros de predicció, així que és una sola lectura.
   */
  const byPop = [...municipis].sort((a, b) => (b.poblacio ?? 0) - (a.poblacio ?? 0)).slice(0, 5);
  const highest = municipis.reduce<typeof municipis[number] | null>(
    (best, m) => (m.altitud != null && (best?.altitud == null || m.altitud > best.altitud) ? m : best), null,
  );
  const popTop = Math.max(...byPop.map((m) => m.altitud ?? 0));
  const forecastPlaces = highest && !byPop.includes(highest) && (highest.altitud ?? 0) - popTop >= 300
    ? [...byPop, highest] : byPop;
  // La màxima d'avui és, com a mínim, la que ja ha fet: a dalt la pàgina diu la
  // mesurada, i la taula no la pot contradir. La mateixa regla que la fitxa.
  const currentOf = new Map(rows.map((r) => [r.m.id, r.current]));
  const forecasts = (await Promise.all(forecastPlaces.map(async (m) => ({
    m,
    days: withObservedToday((await forecastFor(m))?.daily ?? [], today, currentOf.get(m.id) ?? null)
      .filter((d) => d.date >= today).slice(0, FORECAST_DAYS),
  })))).filter((f) => f.days.length === FORECAST_DAYS);
  const forecastDates = forecasts[0]?.days.map((d) => d.date) ?? [];

  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: c.nom, path: c.path },
  ];
  const place = titleParts(c.nom, lang);
  const worst = ['vermell', 'taronja', 'groc'].find((l) => warnings.some((w) => w.level === l));
  const link = (p: { nom: string; path: string }) => <Link href={p.path}>{placeName(p.nom, lang)}</Link>;

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={`${t('El temps', 'El tiempo')} ${place.prep}`}
        title={place.rest}
        lead={summary && summary.withData >= 3 && summary.coldest && summary.warmest ? (
          /*
            Frase d'observació, no de predicció: agregar el consens de fins a 68
            municipis faria d'aquesta pàgina de llistat la més cara del lloc a
            canvi d'una línia. La predicció va a la taula, de sis com a molt.
          */
          es ? (
            <>
              Ahora mismo, {comarcaName(c.nom, lang)} va de los{' '}
              <strong className="tnum">{temp(summary.coldest.value)}</strong> {aName(summary.coldest.nom, lang)} a los{' '}
              <strong className="tnum">{temp(summary.warmest.value)}</strong> {aName(summary.warmest.nom, lang)}.
            </>
          ) : (
            <>
              Ara mateix, {comarcaName(c.nom)} va dels{' '}
              <strong className="tnum">{temp(summary.coldest.value)}</strong> {aName(summary.coldest.nom)} als{' '}
              <strong className="tnum">{temp(summary.warmest.value)}</strong> {aName(summary.warmest.nom)}.
            </>
          )
        ) : undefined}
        stats={summary ? [
          summary.dayMax && {
            label: t("Màxima d'avui", 'Máxima de hoy'), icon: 'thermometer', value: num(summary.dayMax.value, 1), unit: '°C',
            sub: link(summary.dayMax),
          },
          summary.dayMin && {
            label: t("Mínima d'avui", 'Mínima de hoy'), icon: 'thermometer', value: num(summary.dayMin.value, 1), unit: '°C',
            sub: link(summary.dayMin),
          },
          summary.rainedCount > 0 && summary.rainMax && {
            label: t("Pluja d'avui", 'Lluvia de hoy'), icon: 'raindrop', value: num(summary.rainMax.value, 1), unit: 'mm',
            sub: <>{link(summary.rainMax)} · {t('ha plogut en', 'ha llovido en')} {summary.rainedCount}{' '}
              {summary.rainedCount === 1 ? t('municipi', 'municipio') : t('municipis', 'municipios')}</>,
          },
        ] : undefined}
        note={[
          `${c.nMunicipis} ${t('municipis', 'municipios')}`,
          c.poblacio > 0 && `${int(c.poblacio)} ${t('habitants', 'habitantes')}`,
          c.areaKm2 && `${int(c.areaKm2)} km²`,
          c.altitudMin != null && c.altitudMax != null && tr(
            lang,
            `dels ${int(c.altitudMin)} als ${int(c.altitudMax)} m`,
            `de ${int(c.altitudMin)} a ${int(c.altitudMax)} m`,
          ),
        ].filter(Boolean).join(' · ')}
        aside={(
          /*
            El mapa de tot Catalunya amb aquesta comarca marcada. No és
            decoració: ensenya com queda respecte de la resta ara mateix. Saber
            que fa 18 graus no diu gaire; veure que la resta del país en té 25, sí.
          */
          <section className="card" aria-label={tr(lang, `${comarcaName(c.nom)} dins de Catalunya, ara`, `${comarcaName(c.nom, lang)} dentro de Cataluña, ahora`)}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              {t('Ara a Catalunya', 'Ahora en Cataluña')}
            </p>
            <div className="mx-auto max-w-[24rem]">
              <TemperatureMap data={map} highlight={c.codi} variant="compact" lang={lang} />
            </div>
            <p className="card-foot"><Link href="/mapa">{t('Totes les comarques ›', 'Todas las comarcas ›')}</Link></p>
          </section>
        )}
      />

      {worst && (
        <Link href="/avisos" className={`warn-bar is-${worst}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
          <img
            src={`/icons/w/code-${worst === 'vermell' ? 'red' : worst === 'taronja' ? 'orange' : 'yellow'}.svg`}
            width={30}
            height={30}
            alt=""
          />
          <span>
            <strong>
              {warnings.length} {warnings.length === 1
                ? t('avís oficial vigent', 'aviso oficial vigente')
                : t('avisos oficials vigents', 'avisos oficiales vigentes')}
            </strong>{' '}
            {aComarca(c.nom, lang)}. <u>{t('Vegeu-los', 'Consúltelos')}</u>
          </span>
        </Link>
      )}

      {forecasts.length > 0 && (
        <Section id="previsio" title={t('Els pròxims dies', 'Los próximos días')}>
          <div className="card">
            <div className="scroll-x">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">{t('Municipi', 'Municipio')}</th>
                    {forecastDates.map((d) => (
                      <th key={d} scope="col" className="num">
                        <span className="capitalize">{relativeDayTiny(d, today, lang)}</span>
                        <span className="block text-xs font-normal text-[var(--muted)]">{dateShort(d, lang)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {forecasts.map(({ m, days }) => (
                    <tr key={m.id}>
                      <th scope="row" className="text-left font-normal normal-case tracking-normal">
                        <Link href={m.path} className="font-medium text-[var(--ink)] no-underline hover:underline">
                          {placeName(m.nom, lang)}
                        </Link>
                        {m.altitud != null && (
                          <span className="block text-xs text-[var(--muted)] tnum">{int(m.altitud)} m</span>
                        )}
                      </th>
                      {days.map((d) => (
                        <td key={d.date} className="num">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            <WeatherIcon code={d.weatherCode} size={28} lang={lang} />
                            <span className="tnum">
                              <span className="font-semibold text-[var(--ink)]">{temp(d.tMax, 0)}</span>
                              <span className="ml-1 text-[var(--muted)]">{temp(d.tMin, 0)}</span>
                            </span>
                          </span>
                          {d.precipitation >= 1 && (
                            <span className="block text-xs text-[var(--muted)] tnum">{num(d.precipitation, 1)} mm</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="source">
              {es ? (
                <>
                  Máxima y mínima de cada día, y la lluvia cuando llega a 1 mm. Son los municipios
                  más poblados {deComarca(c.nom, lang)}
                  {forecasts.length > byPop.length && ' y el más alto'}; la predicción de cualquier
                  otro está en su ficha.
                </>
              ) : (
                <>
                  Màxima i mínima de cada dia, i la pluja quan arriba a 1 mm. Són els municipis
                  més poblats {deComarca(c.nom)}
                  {forecasts.length > byPop.length && ' i el més alt'}; la predicció de qualsevol
                  altre és a la seva fitxa.
                </>
              )}
            </p>
          </div>
        </Section>
      )}

      <Section id="municipis" title={tr(lang, `Els ${municipis.length} municipis`, `Los ${municipis.length} municipios`)}>
        <div className="card">
          <ul className="rows rows-cols">
            {rows.map(({ m, current }) => {
              const t = current?.temperatureAdjusted ?? null;
              return (
                <li key={m.id}>
                  <Link href={m.path} className="row-main">
                    <span className="row-title">{placeName(m.nom, lang)}</span>
                    {m.altitud != null && <span className="row-sub tnum">{int(m.altitud)} m</span>}
                  </Link>
                  {t != null && (
                    <span
                      className="temp-pill"
                      style={{ background: temperatureColor(t), color: temperatureInk(t) }}
                    >
                      {t.toFixed(0)}°
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {es ? (
            <p className="source">
              Temperatura de la estación de la XEMA más cercana a cada municipio, corregida por el
              desnivel. {conTemp.length} de {municipis.length} municipios tienen lectura reciente
              {summary && summary.nStations > 0 && (
                <>, y detrás hay {summary.nStations}{' '}
                  {summary.nStations === 1 ? 'estación' : 'estaciones distintas'}</>
              )}. Datos del {dateLong(today, lang)}.
            </p>
          ) : (
            <p className="source">
              Temperatura de l&apos;estació de la XEMA més propera a cada municipi, corregida pel
              desnivell. {conTemp.length} de {municipis.length} municipis tenen lectura recent
              {summary && summary.nStations > 0 && (
                <>, i darrere hi ha {summary.nStations}{' '}
                  {summary.nStations === 1 ? 'estació' : 'estacions'} diferents</>
              )}. Dades {dateLong(today)}.
            </p>
          )}
        </div>
      </Section>

      <p className="mt-8 text-sm text-[var(--muted)]">
        {t('Els avisos', 'Los avisos')} {deComarca(c.nom, lang)}, {t('com a', 'como')}{' '}
        <Link href={`/avisos/feed/${c.slug}`} className="text-[var(--accent)] no-underline hover:underline">
          feed
        </Link>{' '}{t('o com a', 'o como')}{' '}
        <Link href={`/avisos/feed/${c.slug}?format=ics`} className="text-[var(--accent)] no-underline hover:underline">
          {t('calendari', 'calendario')}
        </Link>.
      </p>
    </article>
  );
}
