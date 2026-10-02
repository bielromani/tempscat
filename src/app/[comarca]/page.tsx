import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { comarcaBySlug, municipisOfComarca } from '@/lib/territory';
import { activeWarnings, currentFor } from '@/lib/weather';
import { comarcaSummary } from '@/lib/comparison';
import { temperatureMap } from '@/lib/map';
import { TemperatureMap } from '@/components/TemperatureMap';
import { aName, aNameParts, comarcaName, dateLong, deComarca, num, temp } from '@/lib/format';
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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { comarca } = await params;
  const c = comarcaBySlug(comarca);
  if (!c) return {};
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

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: c.nom, path: c.path },
  ];
  const place = aNameParts(comarcaName(c.nom));
  const worst = ['vermell', 'taronja', 'groc'].find((l) => warnings.some((w) => w.level === l));
  const link = (p: { nom: string; path: string }) => <Link href={p.path}>{p.nom}</Link>;

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow={`El temps ${place.prep}`}
        title={place.rest}
        lead={summary && summary.withData >= 3 && summary.coldest && summary.warmest ? (
          /*
            Frase d'observació, no de predicció: agregar el consens de fins a 68
            municipis faria d'aquesta pàgina de llistat la més cara del lloc a
            canvi d'una línia.
          */
          <>
            Ara mateix, {comarcaName(c.nom)} va dels{' '}
            <strong className="tnum">{temp(summary.coldest.value)}</strong> {aName(summary.coldest.nom)} als{' '}
            <strong className="tnum">{temp(summary.warmest.value)}</strong> {aName(summary.warmest.nom)}.
          </>
        ) : undefined}
        stats={summary ? [
          summary.dayMax && {
            label: "Màxima d'avui", icon: 'thermometer', value: num(summary.dayMax.value, 1), unit: '°C',
            sub: link(summary.dayMax),
          },
          summary.dayMin && {
            label: "Mínima d'avui", icon: 'thermometer', value: num(summary.dayMin.value, 1), unit: '°C',
            sub: link(summary.dayMin),
          },
          summary.rainedCount > 0 && summary.rainMax && {
            label: "Pluja d'avui", icon: 'raindrop', value: num(summary.rainMax.value, 1), unit: 'mm',
            sub: <>{link(summary.rainMax)} · ha plogut en {summary.rainedCount}{' '}
              {summary.rainedCount === 1 ? 'municipi' : 'municipis'}</>,
          },
        ] : undefined}
        note={[
          `${c.nMunicipis} municipis`,
          c.poblacio > 0 && `${c.poblacio.toLocaleString('ca-ES')} habitants`,
          c.areaKm2 && `${c.areaKm2.toLocaleString('ca-ES')} km²`,
          c.altitudMin != null && c.altitudMax != null && `dels ${c.altitudMin} als ${c.altitudMax} m`,
        ].filter(Boolean).join(' · ')}
        aside={(
          /*
            El mapa de tot Catalunya amb aquesta comarca marcada. No és
            decoració: ensenya com queda respecte de la resta ara mateix. Saber
            que fa 18 graus no diu gaire; veure que la resta del país en té 25, sí.
          */
          <section className="card" aria-label={`${comarcaName(c.nom)} dins de Catalunya, ara`}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              Ara a Catalunya
            </p>
            <div className="mx-auto max-w-[24rem]">
              <TemperatureMap data={map} highlight={c.codi} variant="compact" />
            </div>
            <p className="card-foot"><Link href="/mapa">Totes les comarques ›</Link></p>
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
              {warnings.length} {warnings.length === 1 ? 'avís oficial vigent' : 'avisos oficials vigents'}
            </strong>{' '}
            {aName(comarcaName(c.nom))}. <u>Vegeu-los</u>
          </span>
        </Link>
      )}

      <Section id="municipis" title={`Els ${municipis.length} municipis`}>
        <div className="card">
          <ul className="rows rows-cols">
            {rows.map(({ m, current }) => {
              const t = current?.temperatureAdjusted ?? null;
              return (
                <li key={m.id}>
                  <Link href={m.path} className="row-main">
                    <span className="row-title">{m.nom}</span>
                    {m.altitud != null && <span className="row-sub tnum">{m.altitud} m</span>}
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
          <p className="source">
            Temperatura de l&apos;estació de la XEMA més propera a cada municipi, corregida pel
            desnivell. {conTemp.length} de {municipis.length} municipis tenen lectura recent
            {summary && summary.nStations > 0 && (
              <>, i darrere hi ha {summary.nStations}{' '}
                {summary.nStations === 1 ? 'estació' : 'estacions'} diferents</>
            )}. Dades {dateLong(today)}.
          </p>
        </div>
      </Section>

      <p className="mt-8 text-sm text-[var(--muted)]">
        Els avisos {deComarca(c.nom)}, com a{' '}
        <Link href={`/avisos/feed/${c.slug}`} className="text-[var(--accent)] no-underline hover:underline">
          feed
        </Link>{' '}o com a{' '}
        <Link href={`/avisos/feed/${c.slug}?format=ics`} className="text-[var(--accent)] no-underline hover:underline">
          calendari
        </Link>.
      </p>
    </article>
  );
}
