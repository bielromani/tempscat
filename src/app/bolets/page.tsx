import type { Metadata } from 'next';
import Link from 'next/link';
import { aName, int, num } from '@/lib/format';
import { allRainConditions } from '@/lib/conditions';
import { allComarques, stationByCodi } from '@/lib/territory';

/**
 * Ha llovido bastante para los bolets.
 *
 * ## Por qué esta página y no un índice
 *
 * La tentación es publicar un «índex boletaire» del 1 al 10. No se hace, y la
 * razón está escrita en `conditions.ts`: un número compuesto oculta qué lo mueve
 * y nadie lo puede discutir. Aquí van los tres datos que usa quien entiende —
 * cuánta agua ha caído, cuándo fue la última buena, y con qué temperaturas — y la
 * conclusión la saca el lector.
 *
 * ## Por qué funciona todo el año
 *
 * Es una página de **lluvia acumulada** con un título que dice para qué la busca
 * la gente. En mayo sirve igual para saber si el campo está seco. No se apaga
 * fuera de temporada porque no depende de la temporada.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Ha plogut prou per als bolets?',
  description:
    'Pluja acumulada dels últims quinze i trenta dies a cada comarca, quan va ser '
    + 'l\'últim ruixat i amb quines temperatures. Dades de les estacions de la XEMA.',
  alternates: { canonical: '/bolets' },
};

export default async function BoletsPage() {
  const conditions = await allRainConditions();
  const comarcaName = new Map(allComarques().map((c) => [c.codi, c.nom]));

  const rows = conditions
    .map((c) => {
      const station = stationByCodi(c.station);
      if (!station?.operativa) return null;
      return { c, station, comarca: comarcaName.get(station.comarcaCodi ?? '') ?? '' };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => b.c.rain15 - a.c.rain15);

  const top = rows[0];
  const wet = rows.filter((r) => r.c.rain15 >= 20).length;

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Bolets</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ha plogut prou per als bolets?
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          {top ? (
            <>
              On més ha plogut aquests quinze dies és{' '}
              <Link href={`/estacions/${top.station.codi}`} className="text-[var(--ink)] no-underline hover:underline">
                {aName(top.station.nom)}
              </Link>
              , amb <span className="tnum font-semibold text-[var(--ink)]">{num(top.c.rain15, 1)} mm</span>.{' '}
              {wet > 0
                ? `${wet} ${wet === 1 ? 'estació passa' : 'estacions passen'} dels 20 mm en quinze dies.`
                : 'Cap estació passa dels 20 mm en quinze dies.'}
            </>
          ) : (
            'Encara no hi ha sèrie diària carregada.'
          )}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          No hi ha cap índex ni cap nota del zero al deu: hi ha la pluja que ha
          caigut, quan va caure i amb quines temperatures. Són les tres dades
          que fa servir qui hi entén, i cadascuna es pot comprovar per separat.
        </p>
      </header>

      <div className="scroll-x">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Pluja acumulada per estació, ordenada de més a menys en quinze dies
          </caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Estació</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">15 dies</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">30 dies</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Últim ruixat</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Mín. / màx. de 10 dies</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ c, station, comarca }) => (
              <tr key={station.codi} className="border-b border-[var(--line-soft)]">
                <td className="py-2.5 pr-4">
                  <Link
                    href={`/estacions/${station.codi}`}
                    className="text-[var(--ink)] no-underline hover:underline"
                  >
                    {station.nom}
                  </Link>
                  <span className="block text-xs text-[var(--muted)]">
                    {comarca}
                    {station.altitud != null && ` · ${int(station.altitud)} m`}
                  </span>
                </td>
                <td className="tnum py-2.5 pr-4">
                  {/* La barra da la lectura rápida sin inventar ningún umbral:
                      es proporcional a los milímetros y nada más. */}
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-[var(--ink)]">{num(c.rain15, 1)}</span>
                    <span
                      aria-hidden
                      className="inline-block h-1.5 rounded-full"
                      style={{
                        width: `${Math.min(64, c.rain15 * 1.2)}px`,
                        background: 'oklch(52% 0.13 245)',
                        opacity: c.rain15 > 0 ? 0.85 : 0,
                      }}
                    />
                  </span>
                </td>
                <td className="tnum py-2.5 pr-4 text-[var(--ink-2)]">{num(c.rain30, 1)}</td>
                <td className="tnum py-2.5 pr-4 text-xs text-[var(--muted)]">
                  {c.daysSinceRain == null
                    ? 'no consta'
                    : c.daysSinceRain === 0
                      ? 'avui'
                      : `fa ${c.daysSinceRain} ${c.daysSinceRain === 1 ? 'dia' : 'dies'}`}
                </td>
                <td className="tnum py-2.5 text-xs text-[var(--muted)]">
                  {c.tMinAvg10 != null && c.tMaxAvg10 != null
                    ? `${num(c.tMinAvg10, 1)} / ${num(c.tMaxAvg10, 1)} °C`
                    : '—'}
                  {c.frostRecently && (
                    <span className="ml-1" style={{ color: 'var(--accent)' }}>· glaçada</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Com es llegeix això
        </h2>
        <p>
          El que sol buscar qui hi entén és una <strong className="font-medium text-[var(--ink)]">bona
          mullena</strong> seguida d&apos;una <strong className="font-medium text-[var(--ink)]">o
          dues setmanes</strong> de temperatures suaus: el miceli no fructifica el
          dia que plou, sinó dies després. Per això la columna de l&apos;últim ruixat
          importa tant com la de l&apos;acumulat — 60 mm d&apos;ahir i 60 mm de fa dotze
          dies són dos escenaris ben diferents.
        </p>
        <p>
          La glaçada talla la temporada de cop a la cota on ha caigut, i per això
          es marca. I un acumulat gran repartit en gotes petites no compta igual que
          el mateix acumulat en dos dies.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">La pluja de l&apos;estació no és la del bosc.</strong>{' '}
          Una tempesta d&apos;estiu descarrega en una vall i no a la del costat, i els
          aparells estan on hi ha instrumentació, no on hi ha rovellons. Això
          serveix per situar-se per comarques, no per triar un obac.
        </p>
        <p className="text-[var(--muted)]">
          Dades del Servei Meteorològic de Catalunya (XEMA), sèrie diària de cada
          estació. Els dies sense dada no compten com a dies secs: si l&apos;estació
          no ha mesurat, no sabem què va caure.
        </p>
      </section>
    </article>
  );
}
