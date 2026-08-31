import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { allComarques, comarcaBySlug, municipisOfComarca } from '@/lib/territory';
import { activeWarnings, currentFor } from '@/lib/weather';
import { comarcaSummary } from '@/lib/comparison';
import { aName, comarcaName, dateLong, deComarca, num, temp } from '@/lib/format';
import { localToday } from '@/lib/weather';

/** Página de comarca: 43 rutas, todas prerenderizadas. */
export const dynamicParams = false;
export const revalidate = 600;   // 10 min: lleva observación en viu

type Params = Promise<{ comarca: string }>;

export async function generateStaticParams() {
  return allComarques().map((c) => ({ comarca: c.slug }));
}

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
  const summary = comarcaSummary(c.codi);
  const warnings = activeWarnings().filter((w) => w.comarcaCodis.includes(c.codi));
  const today = localToday();

  // Observación actual de cada municipio. Sale del snapshot ya en memoria, así
  // que no cuesta nada aunque sean 68 municipios.
  const rows = municipis.map((m) => ({ m, current: currentFor(m) }));
  const conTemp = rows.filter((r) => r.current?.temperatureAdjusted != null);
  const sorted = [...conTemp].sort(
    (a, b) => (a.current!.temperatureAdjusted!) - (b.current!.temperatureAdjusted!),
  );

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">{c.nom}</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{c.nom}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {c.nMunicipis} municipis
          {c.poblacio > 0 && ` · ${c.poblacio.toLocaleString('ca-ES')} habitants`}
          {c.areaKm2 && ` · ${c.areaKm2.toLocaleString('ca-ES')} km²`}
          {c.densitat && ` · ${c.densitat.toLocaleString('ca-ES')} hab/km²`}
          {c.altitudMin != null && c.altitudMax != null && ` · dels ${c.altitudMin} als ${c.altitudMax} m`}
        </p>
      </header>

      {summary && summary.withData >= 3 && (
        <p className="mb-6 max-w-[64ch] leading-relaxed text-[var(--ink-2)]">
          {/*
            Frase de observación, no de predicción: agregar el consenso de hasta
            68 municipios convertiría esta página de listado en la más cara del
            sitio a cambio de una línea.
          */}
          Ara mateix {comarcaName(c.nom)} va dels{' '}
          <strong className="tnum font-medium text-[var(--ink)]">{temp(summary.coldest?.value)}</strong>{' '}
          {summary.coldest && aName(summary.coldest.nom)} als{' '}
          <strong className="tnum font-medium text-[var(--ink)]">{temp(summary.warmest?.value)}</strong>{' '}
          {summary.warmest && aName(summary.warmest.nom)}.
          {summary.dayMax && summary.dayMin && (
            <> Avui s&apos;ha arribat als {temp(summary.dayMax.value)} {aName(summary.dayMax.nom)} i
              la mínima ha estat de {temp(summary.dayMin.value)} {aName(summary.dayMin.nom)}.</>
          )}
          {summary.rainedCount > 0 && summary.rainMax && (
            <> Ha plogut en {summary.rainedCount} {summary.rainedCount === 1 ? 'municipi' : 'municipis'},
              amb {num(summary.rainMax.value, 1)} mm {aName(summary.rainMax.nom)}.</>
          )}
        </p>
      )}

      {warnings.length > 0 && (
        <p className="mb-6 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3 text-sm text-[var(--ink-2)]">
          Hi ha {warnings.length} {warnings.length === 1 ? 'avís oficial vigent' : 'avisos oficials vigents'}{' '}
          {aName(comarcaName(c.nom))}.{' '}
          <Link href="/avisos" className="text-[var(--accent)] no-underline hover:underline">
            Veure els avisos ›
          </Link>
        </p>
      )}

      {sorted.length >= 3 && (
        <section className="mb-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Ara mateix, el més fresc</p>
            <p className="mt-1">
              <Link href={sorted[0].m.path} className="text-lg font-semibold no-underline text-[var(--ink)]">
                {sorted[0].m.nom}
              </Link>
              <span className="tnum ml-2 text-lg text-[var(--ink-2)]">
                {sorted[0].current!.temperatureAdjusted!.toFixed(1).replace('.', ',')} °C
              </span>
            </p>
          </div>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Ara mateix, el més càlid</p>
            <p className="mt-1">
              <Link href={sorted[sorted.length - 1].m.path} className="text-lg font-semibold no-underline text-[var(--ink)]">
                {sorted[sorted.length - 1].m.nom}
              </Link>
              <span className="tnum ml-2 text-lg text-[var(--ink-2)]">
                {sorted[sorted.length - 1].current!.temperatureAdjusted!.toFixed(1).replace('.', ',')} °C
              </span>
            </p>
          </div>
        </section>
      )}

      <h2 className="mb-3 text-lg font-semibold tracking-tight">
        Municipis {deComarca(c.nom)}
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(({ m, current }) => {
          const t = current?.temperatureAdjusted ?? null;
          return (
            <li key={m.id}>
              <Link
                href={m.path}
                className="flex items-center justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 no-underline hover:border-[var(--accent)]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[var(--ink)]">{m.nom}</span>
                  {m.altitud != null && (
                    <span className="tnum text-xs text-[var(--muted)]">{m.altitud} m</span>
                  )}
                </span>
                {t != null && (
                  <span
                    className="tnum shrink-0 rounded px-2 py-0.5 text-sm font-semibold"
                    style={{ background: temperatureColor(t), color: temperatureInk(t) }}
                  >
                    {t.toFixed(0)}°
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 max-w-[70ch] text-xs leading-relaxed text-[var(--muted)]">
        Temperatures de les estacions automàtiques de la XEMA més properes a cada
        municipi, corregides pel desnivell. {conTemp.length} de {municipis.length} municipis
        tenen lectura recent
        {summary && summary.nStations > 0 && (
          <>, i darrere hi ha {summary.nStations}{' '}
            {summary.nStations === 1 ? 'estació' : 'estacions'} diferents</>
        )}. Dades {dateLong(today)}.
      </p>
    </article>
  );
}
