import type { Metadata } from 'next';
import Link from 'next/link';
import { rankings, type PlaceRow, type StationRow } from '@/lib/rankings';
import { PointsMap } from '@/components/PointsMap';
import { TemperatureLegend } from '@/components/TemperatureMap';
import { mapOutline } from '@/lib/map';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import {
  aName, ago, comarcaName, dateLong, deName, int, num, signed,
} from '@/lib/format';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

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
export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Rànquings del dia · el poble més fred i el més càlid de Catalunya',
  description:
    'On ha fet més fred i més calor avui a Catalunya: extrems de les estacions '
    + 'automàtiques de la XEMA, amplitud tèrmica, pluja acumulada i ratxes de vent.',
  alternates: { canonical: '/ranquings' },
};

const TRAIL = [
  { nom: 'Catalunya', path: '/' },
  { nom: 'Rànquings', path: '/ranquings' },
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
  rows, unit, decimals = 1, colored = false, empty,
}: {
  rows: StationRow[];
  unit: string;
  decimals?: number;
  colored?: boolean;
  empty: string;
}) {
  if (!rows.length) return <p className="text-sm text-[var(--muted)]">{empty}</p>;

  return (
    <ol className="rows">
      {rows.map((r, i) => (
        <li key={r.codi}>
          <span className="flex min-w-0 items-center gap-3">
            <Rank n={i + 1} />
            <span className="row-main">
              <Link href={`/estacions/${r.codi}`} className="row-title">{r.nom}</Link>
              <span className="row-sub">
                {r.comarcaNom && comarcaName(r.comarcaNom)}
                {r.altitud != null && ` · ${int(r.altitud)}\u00a0m`}
                {r.note && ` · ${r.note}`}
                {r.path && r.placeNom && (
                  <>
                    {' · '}
                    <Link
                      href={r.path}
                      title={`El temps ${aName(r.placeNom)}, a ${num(r.distKm ?? 0, 1)} km de l'estació`}
                    >
                      {r.placeNom} ›
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

function PlaceList({ rows }: { rows: PlaceRow[] }) {
  return (
    <ol className="rows">
      {rows.map((r, i) => (
        <li key={r.id}>
          <span className="flex min-w-0 items-center gap-3">
            <Rank n={i + 1} />
            <span className="row-main">
              <Link href={r.path} className="row-title">{r.nom}</Link>
              <span className="row-sub">
                {r.comarcaNom && comarcaName(r.comarcaNom)}
                {r.altitud != null && ` · ${int(r.altitud)}\u00a0m`}
                {' · '}estació {deName(r.stationNom)}
                {r.dAltM != null && Math.abs(r.dAltM) >= 25 && ` (${signed(r.dAltM, 0, 'm')})`}
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
  const r = await rankings();

  if (!r) {
    return (
      <article>
        <JsonLd data={graph(breadcrumbLd(TRAIL))} />
        <PageHero
          crumbs={TRAIL}
          eyebrow="Rànquings de Catalunya"
          icon="thermometer"
          title="Els extrems d'avui"
          lead={(
            <>
              Encara no hi ha cap observació carregada. Els rànquings apareixen tan
              aviat com arriba la primera lectura de la XEMA.
            </>
          )}
        />
      </article>
    );
  }

  const outline = mapOutline();
  const cold = r.stations.nowColdest[0];
  const warm = r.stations.nowWarmest[0];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(TRAIL))} />

      <PageHero
        crumbs={TRAIL}
        eyebrow="Rànquings de Catalunya"
        icon="thermometer"
        title="Els extrems d'avui"
        lead={cold && warm ? (
          <>
            Entre l&apos;estació més freda i la més càlida hi ha ara{' '}
            <strong className="tnum">{num(warm.value - cold.value, 1)} graus</strong> de diferència.
          </>
        ) : undefined}
        note={(
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
          <section className="card" aria-label="La temperatura de cada estació, ara">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              Ara a Catalunya
            </p>
            <PointsMap
              outline={outline.features}
              projection={outline.projection}
              width={outline.width}
              height={outline.height}
              maxHeight={380}
              scale={2}
              ariaLabel={`Mapa de Catalunya amb la temperatura de les ${r.now.length} estacions ara mateix`}
              points={r.now.map((s) => ({
                key: s.codi,
                lat: s.lat,
                lon: s.lon,
                fill: temperatureColor(s.t),
                tip: `${s.nom}: ${num(s.t, 1)} °C`,
              }))}
            />
            <TemperatureLegend />
            <p className="source">
              Cada punt és una estació amb la lectura d&apos;ara, sense corregir pel
              desnivell: les de muntanya surten fredes perquè hi són.
            </p>
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
              { label: 'Ara, el més fred', row: cold },
              { label: 'Ara, el més càlid', row: warm },
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
                    <Link href={`/estacions/${row.codi}`} className="font-semibold">{row.nom}</Link>
                    <span className="block text-[var(--muted)]">
                      {row.comarcaNom && comarcaName(row.comarcaNom)}
                      {row.altitud != null && ` · ${int(row.altitud)}\u00a0m`}
                    </span>
                    {row.path && row.placeNom && (
                      <Link href={row.path} className="mt-1 block" style={{ color: 'var(--accent)' }}>
                        El temps {aName(row.placeNom)} ›
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PageHero>

      <Section id="dia" title="Extrems del dia">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <Block title="Màximes més altes" icon="thermometer" hint="Des de la mitjanit d'avui">
            <StationList rows={r.stations.dayMax} unit="°C" colored empty="Encara no hi ha màximes del dia." />
          </Block>
          <Block title="Mínimes més baixes" icon="thermometer" hint="Des de la mitjanit d'avui">
            <StationList rows={r.stations.dayMin} unit="°C" colored empty="Encara no hi ha mínimes del dia." />
          </Block>
          <Block
            title="Més amplitud tèrmica"
            icon="thermometer"
            hint="Diferència entre la màxima i la mínima del dia: el número que separa el clima continental del litoral"
          >
            <StationList rows={r.stations.range} unit="°C" empty="Encara no es pot calcular." />
          </Block>
          <Block title="Més pluja" icon="raindrops" hint="Acumulada des de la mitjanit">
            <StationList rows={r.stations.rain} unit="mm" empty="No ha plogut en cap estació." />
          </Block>
          <Block title="Ratxes més fortes" icon="wind" hint="Ratxa màxima de l'última lectura, no del dia">
            <StationList rows={r.stations.gust} unit="km/h" decimals={0} empty="Sense dades de ratxa." />
          </Block>
          <Block title="Ara mateix, les més fresques" icon="thermometer">
            <StationList rows={r.stations.nowColdest} unit="°C" colored empty="Sense observació." />
          </Block>
        </div>
      </Section>

      <Section id="pobles" title="Als pobles">
        <p className="-mt-1 mb-4 measure text-[15px] leading-relaxed text-[var(--ink-2)]">
          Aquí són poblacions, no termòmetres: la lectura de l&apos;estació de
          referència corregida pel desnivell de cada municipi. És una{' '}
          <strong className="font-semibold text-[var(--ink)]">estimació</strong>, no una mesura.
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
          <Block title="Els municipis més frescos ara" icon="thermometer">
            <PlaceList rows={r.places.coldest} />
          </Block>
          <Block title="Els municipis més càlids ara" icon="thermometer">
            <PlaceList rows={r.places.warmest} />
          </Block>
        </div>
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
      </Section>
    </article>
  );
}
