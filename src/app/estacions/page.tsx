import type { Metadata } from 'next';
import Link from 'next/link';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { comarcaName, int, num } from '@/lib/format';
import { allObservations } from '@/lib/weather';
import { allComarques, operativeStations } from '@/lib/territory';

/**
 * Índice de estaciones, agrupado por comarca.
 *
 * Es el mapa de la red sin mapa: dice cuántos termómetros hay de verdad y dónde,
 * que es la pregunta que un lector atento se hace en cuanto ve que este sitio
 * publica 4.293 puntos con 189 estaciones. Enseñar la densidad real —y las
 * comarcas que no tienen ninguna— vale más que esconderla.
 */
export const revalidate = 600;

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

export default function EstacionsPage() {
  const stations = operativeStations();
  const obs = allObservations();
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

  const alts = stations.map((s) => s.altitud).filter((v): v is number => v != null);

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Estacions</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Les estacions que hi ha de veritat
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          {stations.length} estacions automàtiques en servei, entre{' '}
          {int(Math.min(...alts))} i {int(Math.max(...alts))} m. Cada una té la seva
          fitxa amb els rècords, les normals mes a mes calculades sobre la seva
          pròpia sèrie, i d&apos;on li ve el vent.
        </p>
        <p className="mt-2 leading-relaxed text-[var(--muted)]">
          Publiquem 4.293 llocs amb {stations.length} termòmetres, i aquesta pàgina
          existeix per dir-ho clar: entre l&apos;estació i el poble hi ha una
          correcció per desnivell, i com més lluny i més desnivell, menys es pot
          demanar a aquesta correcció.{' '}
          {without.length > 0 && (
            <>
              {without.length === 1 ? 'Hi ha una comarca' : `Hi ha ${without.length} comarques`}{' '}
              sense cap estació en servei: {without.map((c) => comarcaName(c.nom)).join(', ')}.
            </>
          )}
        </p>
      </header>

      {withStation.map((c) => {
        const list = (byComarca.get(c.codi) ?? [])
          .slice()
          .sort((a, b) => (b.altitud ?? 0) - (a.altitud ?? 0));
        return (
          <section key={c.codi} className="mb-6">
            <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              <Link href={c.path} className="no-underline text-[var(--ink-2)] hover:text-[var(--ink)]">
                {comarcaName(c.nom)}
              </Link>
              <span className="tnum font-normal normal-case">{list.length}</span>
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((s) => {
                const t = tempOf.get(s.codi) ?? null;
                return (
                  <li key={s.codi}>
                    <Link
                      href={`/estacions/${s.codi}`}
                      className="flex items-center justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 no-underline hover:border-[var(--accent)]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-[var(--ink)]">{s.nom}</span>
                        <span className="tnum text-xs text-[var(--muted)]">
                          {s.altitud != null ? `${int(s.altitud)} m` : '—'} · {s.codi}
                        </span>
                      </span>
                      {t != null && (
                        <span
                          className="tnum shrink-0 rounded px-2 py-0.5 text-sm font-semibold"
                          style={{ background: temperatureColor(t), color: temperatureInk(t) }}
                        >
                          {num(t, 0)}°
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {orphans.length > 0 && (
        <p className="mt-6 text-xs text-[var(--muted)]">
          {orphans.length} estacions sense comarca assignada al catàleg d&apos;origen.
        </p>
      )}
    </article>
  );
}
