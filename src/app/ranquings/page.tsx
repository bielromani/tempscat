import type { Metadata } from 'next';
import Link from 'next/link';
import { rankings, type PlaceRow, type StationRow } from '@/lib/rankings';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { aName, ago, dateLong, deName, int, num, signed } from '@/lib/format';

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
    'On ha fet més fred i més calor avui a Catalunya: extrems de les 183 estacions '
    + 'automàtiques de la XEMA, amplitud tèrmica, pluja acumulada i ratxes de vent.',
  alternates: { canonical: '/ranquings' },
};

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
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li key={r.codi} className="flex items-baseline gap-3 border-b border-[var(--line-soft)] py-1.5 last:border-0">
          <span className="tnum w-4 shrink-0 text-xs text-[var(--muted)]">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-[var(--ink)]">{r.nom}</span>
            <span className="block truncate text-xs text-[var(--muted)]">
              {r.comarcaNom}
              {r.altitud != null && ` · ${int(r.altitud)} m`}
              {r.note && ` · ${r.note}`}
            </span>
          </span>
          {r.path && r.placeNom && (
            <Link
              href={r.path}
              className="hidden shrink-0 text-xs text-[var(--muted)] no-underline hover:text-[var(--accent)] sm:block"
              title={`El temps ${aName(r.placeNom)}, a ${num(r.distKm ?? 0, 1)} km de l'estació`}
            >
              {r.placeNom} ›
            </Link>
          )}
          <span
            className="tnum shrink-0 rounded px-2 py-0.5 text-sm font-semibold"
            style={colored
              ? { background: temperatureColor(r.value), color: temperatureInk(r.value) }
              : { color: 'var(--ink)' }}
          >
            {num(r.value, decimals)}
            <span className="ml-0.5 text-xs font-normal" style={{ opacity: 0.75 }}>{unit}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function PlaceList({ rows }: { rows: PlaceRow[] }) {
  return (
    <ol className="space-y-1">
      {rows.map((r, i) => (
        <li key={r.id} className="flex items-baseline gap-3 border-b border-[var(--line-soft)] py-1.5 last:border-0">
          <span className="tnum w-4 shrink-0 text-xs text-[var(--muted)]">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <Link href={r.path} className="block truncate text-sm text-[var(--ink)] no-underline hover:underline">
              {r.nom}
            </Link>
            <span className="block truncate text-xs text-[var(--muted)]">
              {r.comarcaNom}
              {r.altitud != null && ` · ${int(r.altitud)} m`}
              {' · '}estació {deName(r.stationNom)}
              {r.dAltM != null && Math.abs(r.dAltM) >= 25 && ` (${signed(r.dAltM, 0, 'm')})`}
            </span>
          </span>
          <span
            className="tnum shrink-0 rounded px-2 py-0.5 text-sm font-semibold"
            style={{ background: temperatureColor(r.value), color: temperatureInk(r.value) }}
          >
            {num(r.value, 1)}
            <span className="ml-0.5 text-xs font-normal" style={{ opacity: 0.75 }}>°C</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
      <h3 className="text-sm font-semibold tracking-tight text-[var(--ink)]">{title}</h3>
      {hint && <p className="mb-2 mt-0.5 text-xs text-[var(--muted)]">{hint}</p>}
      <div className={hint ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}

export default async function RanquingsPage() {
  const r = await rankings();

  if (!r) {
    return (
      <article>
        <h1 className="text-3xl font-semibold tracking-tight">Rànquings</h1>
        <p className="mt-4 text-[var(--muted)]">
          Encara no hi ha cap observació carregada. Els rànquings apareixen tan
          aviat com el worker de la XEMA hagi corregut.
        </p>
      </article>
    );
  }

  const cold = r.stations.nowColdest[0];
  const warm = r.stations.nowWarmest[0];

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Rànquings</span>
      </nav>

      <header className="mb-6 max-w-[62ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Els extrems d&apos;avui a Catalunya
        </h1>
        <p className="mt-2 text-[var(--ink-2)]">
          On fa més fred i més calor ara mateix, i quins han estat els extrems del
          dia. Surt de les {r.stations.total} estacions automàtiques de la XEMA
          amb dada recent — {dateLong(r.day)}.
        </p>
      </header>

      {/* Los dos titulares, con el color de la propia temperatura. */}
      {cold && warm && (
        <div className="mb-8 grid gap-3 sm:grid-cols-2">
          {[
            { label: 'Ara mateix, el més fred', row: cold },
            { label: 'Ara mateix, el més càlid', row: warm },
          ].map(({ label, row }) => {
            const ink = temperatureInk(row.value);
            return (
              <div
                key={label}
                className="rounded-lg p-5"
                style={{
                  background: `linear-gradient(135deg, ${temperatureColor(row.value)} 0%, ${temperatureColor(row.value - 3)} 100%)`,
                  color: ink,
                }}
              >
                <p className="text-xs font-medium uppercase tracking-wide" style={{ opacity: 0.75 }}>
                  {label}
                </p>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="tnum text-5xl font-semibold tracking-tight">{num(row.value, 1)}</span>
                  <span className="text-xl" style={{ opacity: 0.75 }}>°C</span>
                </p>
                <p className="mt-1 text-lg font-medium">{row.nom}</p>
                <p className="text-sm" style={{ opacity: 0.8 }}>
                  {row.comarcaNom}
                  {row.altitud != null && ` · ${int(row.altitud)} m`}
                </p>
                {row.path && row.placeNom && (
                  <p className="mt-3 text-sm">
                    <Link href={row.path} className="underline" style={{ color: ink }}>
                      El temps {aName(row.placeNom)}
                    </Link>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Extrems del dia</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Màximes més altes" hint="Des de la mitjanit d'avui">
          <StationList rows={r.stations.dayMax} unit="°C" colored empty="Encara no hi ha màximes del dia." />
        </Block>
        <Block title="Mínimes més baixes" hint="Des de la mitjanit d'avui">
          <StationList rows={r.stations.dayMin} unit="°C" colored empty="Encara no hi ha mínimes del dia." />
        </Block>
        <Block
          title="Més amplitud tèrmica"
          hint="Diferència entre la màxima i la mínima del dia: el número que separa el clima continental del litoral"
        >
          <StationList rows={r.stations.range} unit="°C" empty="Encara no es pot calcular." />
        </Block>
        <Block title="Més pluja" hint="Acumulada des de la mitjanit">
          <StationList rows={r.stations.rain} unit="mm" empty="No ha plogut en cap estació." />
        </Block>
        <Block title="Ratxes més fortes" hint="Ratxa màxima de l'última lectura, no del dia">
          <StationList rows={r.stations.gust} unit="km/h" decimals={0} empty="Sense dades de ratxa." />
        </Block>
        <Block title="Ara mateix, les més fresques">
          <StationList rows={r.stations.nowColdest} unit="°C" colored empty="Sense observació." />
        </Block>
      </div>

      <h2 className="mb-1 mt-10 text-lg font-semibold tracking-tight">Als pobles</h2>
      <p className="mb-3 max-w-[62ch] text-sm text-[var(--muted)]">
        La llista de dalt són termòmetres; aquesta són poblacions. El valor
        s&apos;obté corregint la lectura de l&apos;estació de referència pel desnivell
        de cada municipi, així que és una{' '}
        <strong className="font-medium text-[var(--ink-2)]">estimació</strong> i no una
        mesura. Per això va en una llista a part.
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        <Block title="Els municipis més frescos ara">
          <PlaceList rows={r.places.coldest} />
        </Block>
        <Block title="Els municipis més càlids ara">
          <PlaceList rows={r.places.warmest} />
        </Block>
      </div>

      <div className="mt-8 space-y-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
        <p>
          Observacions de {r.source}. La lectura més recent és de fa{' '}
          {r.ageMin != null ? ago(r.ageMin).replace('fa ', '') : '—'}: la XEMA
          publica amb 45 a 65 minuts de retard, així que «ara mateix» vol dir
          l&apos;última mitja hora tancada, no aquest instant.
        </p>
        <p>
          A la classificació de municipis hi entren {int(r.places.total)} dels
          947. {r.places.excluded > 0 && (
            <>
              S&apos;han deixat fora {int(r.places.excluded)} punts que tenen més de
              300 m de desnivell respecte de la seva estació: per damunt d&apos;aquest
              llindar el gradient tèrmic estàndard deixa de ser defensable, i el
              resultat seria un artefacte aritmètic presentat com un titular.
            </>
          )}
        </p>
      </div>
    </article>
  );
}
