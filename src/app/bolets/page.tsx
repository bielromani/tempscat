import type { Metadata } from 'next';
import Link from 'next/link';
import { int, num } from '@/lib/format';
import { allRainConditions } from '@/lib/conditions';
import { allComarques, stationByCodi } from '@/lib/territory';
import { ListFilter, groupsOf } from '@/components/ListFilter';

/**
 * La pluja acumulada de les 189 estacions de la XEMA.
 *
 * ## El que aquesta pàgina deia i no podia dir
 *
 * Es deia «Ha plogut prou per als bolets?» i obria amb «on més ha plogut aquests
 * quinze dies és **a Torredembarra**». El número era correcte i la lectura,
 * absurda. Ordenar les 189 estacions per acumulat no dona les millors zones de
 * bolets: dona **on hi ha pluviòmetres** i on va descarregar l'última tempesta.
 * Un poble de platja i un fons de vall del Pirineu competien pel primer lloc
 * d'una llista que insinuava una cosa que les dades no diuen.
 *
 * Ordenar **aparells** quan la pregunta és sobre **boscos** és un error de
 * concepte, i no es corregeix puntuant millor. Es corregiria amb una capa
 * d'usos del sòl que digués on hi ha bosc, i no la tenim.
 *
 * ## Què és ara
 *
 * El que sempre va ser: la pluja que ha caigut, allà on la mesuren. El títol ho
 * diu, la portada no proclama cap guanyador, i la pregunta dels bolets —que es
 * fa d'un lloc concret— es contesta a la fitxa d'aquell lloc, amb l'estació més
 * propera, la seva distància i el seu desnivell. El bloc és `RainBlock`.
 *
 * Segueix funcionant tot l'any: al maig serveix igual per saber si el camp és
 * sec.
 */
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Quanta pluja ha caigut, estació per estació',
  description:
    'Pluja acumulada dels últims quinze i trenta dies a cada estació de la XEMA, '
    + 'quan va ser l\'últim ruixat de més de 5 mm i amb quines temperatures.',
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

  const groups = groupsOf(rows, (r) => (
    r.station.comarcaCodi ? { key: r.station.comarcaCodi, label: r.comarca } : null
  ));

  const wet = rows.filter((r) => r.c.rain15 >= 20).length;

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Pluja acumulada</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Quanta pluja ha caigut
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          L&apos;acumulat dels últims quinze i trenta dies a cada estació de la XEMA,
          amb el dia de l&apos;últim ruixat de més de 5 mm i les temperatures de la
          desena. {int(rows.length)} estacions en servei
          {wet > 0
            ? `, i ${wet} ${wet === 1 ? 'passa' : 'passen'} dels 20 mm en quinze dies.`
            : ', i cap no passa dels 20 mm en quinze dies.'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          No hi ha cap índex ni cap nota del zero al deu: hi ha la pluja que ha
          caigut, quan va caure i amb quines temperatures. Són les tres dades que
          fa servir qui hi entén, i cadascuna es pot comprovar per separat.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          La taula no ordena cap «millor zona». Un acumulat alt diu on va
          descarregar l&apos;última tempesta i on hi ha un pluviòmetre, no on hi ha
          bosc. Per a un lloc concret, la seva fitxa porta el mateix càlcul amb
          l&apos;estació més propera i el desnivell que hi ha entremig.
        </p>
      </header>

      <ListFilter id="fb" groups={groups} legend="Filtra per comarca" allLabel="Totes les comarques">
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
              <tr
                key={station.codi}
                data-lf={station.comarcaCodi ?? undefined}
                className="border-b border-[var(--line-soft)]"
              >
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
      </ListFilter>

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
