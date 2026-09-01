import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, hikingConditions, MOUNTAIN_M } from '@/lib/activities';
import { windCardinal } from '@/lib/variables';
import { ago, int, num } from '@/lib/format';

/**
 * Com està la muntanya ara mateix.
 *
 * ## Per què el vent va primer
 *
 * Perquè és el que fa mal. La gent mira la temperatura i la pluja, i el que
 * gira una jornada a la carena és una ratxa de 70 km/h — que és força 8, on
 * costa mantenir-se dret. Aquí surt mesurada, no prevista, i amb el que vol dir
 * l'escala al costat.
 *
 * ## Cap nota, cap índex
 *
 * Igual que a `/bolets`: un «índex excursionista» del 0 al 10 amagaria què el
 * mou. Aquí hi ha les xifres i els llindars que existeixen fora d'aquest web
 * —Beaufort, la sensació pel vent—, i la decisió és de qui puja.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Com està la muntanya: vent, fred i isoterma',
  description:
    'Ratxes, temperatura i sensació tèrmica mesurades ara mateix a les estacions '
    + 'd’alta muntanya de Catalunya, i la isoterma de zero graus.',
  alternates: { canonical: '/senderisme' },
};

export default async function SenderismePage() {
  const data = await hikingConditions();
  const stations = data?.stations ?? [];
  const worst = stations
    .filter((s) => s.gustKmh != null)
    .sort((a, b) => (b.gustKmh ?? 0) - (a.gustKmh ?? 0))[0];
  const coldest = stations
    .filter((s) => s.temperature != null)
    .sort((a, b) => (a.temperature ?? 0) - (b.temperature ?? 0))[0];
  const fz = data?.freezing;

  /*
   * Dues columnes que a l'estiu no tenen res a dir.
   *
   * La sensació pel vent només existeix per sota de 10 °C, i la neu, doncs
   * quan n'hi ha. Una columna sencera de guionets sembla que estigui trencada;
   * el que passa és que aquella dada avui no aplica. Si no la té ningú, la
   * columna no hi és.
   */
  const anyChill = stations.some((s) => s.windChill != null);
  const anySnow = stations.some((s) => s.snowCm != null && s.snowCm > 0);

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Senderisme</span>
      </nav>

      <header className="mb-6 max-w-[65ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Com està la muntanya
        </h1>
        {stations.length === 0 ? (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            Encara no hi ha observació de les estacions d&apos;alçada.
          </p>
        ) : (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            {worst?.gustKmh != null && (
              <>
                La ratxa més forta d&apos;ara mateix són{' '}
                <strong className="tnum font-semibold text-[var(--ink)]">{worst.gustKmh} km/h</strong>{' '}
                {worst.nom}
                {worst.gustKmh >= 61 && (
                  <> — força {beaufort(worst.gustKmh).force}, {beaufort(worst.gustKmh).note}</>
                )}.{' '}
              </>
            )}
            {coldest?.temperature != null && (
              <>
                El punt més fred, {coldest.nom}, amb{' '}
                <span className="tnum font-medium text-[var(--ink)]">{num(coldest.temperature, 1)} °C</span>
                {coldest.windChill != null && (
                  <> que amb el vent es noten com {num(coldest.windChill, 0)}</>
                )}.
              </>
            )}
          </p>
        )}
      </header>

      {/* ── Isoterma ── */}
      {fz && (
        <section className="mb-8 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
          <h2 className="text-xs uppercase tracking-wide text-[var(--muted)]">
            La isoterma de zero graus, mesurada
          </h2>
          <p className="mt-2 text-lg text-[var(--ink)]">
            {fz.metres != null ? (
              <>Cap als <strong className="tnum font-semibold">{int(fz.metres)} m</strong></>
            ) : fz.beyond === 'amunt' ? (
              <>Per damunt de qualsevol cim de Catalunya</>
            ) : (
              <>Per sota de l&apos;estació més baixa: fa zero graus arreu</>
            )}
          </p>
          <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-[var(--ink-2)]">
            No surt d&apos;un model: és una regressió de la temperatura contra
            l&apos;altitud sobre les <span className="tnum">{fz.stations}</span> estacions que
            ara mateix donen les dues coses, de {int(fz.lowest)} a {int(fz.highest)} m. El
            gradient mesurat és de{' '}
            <span className="tnum font-medium text-[var(--ink)]">{num(fz.lapse, 1)} °C</span> per
            cada 1.000 m —el teòric de manual és −6,5— i l&apos;ajust val{' '}
            <span className="tnum">{num(fz.r2, 2)}</span> sobre 1.
          </p>
          {fz.metres == null && fz.beyond === 'amunt' && (
            <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-[var(--muted)]">
              No se&apos;n dona la xifra: la recta creua el zero molt per damunt de
              l&apos;estació més alta, i el valor seria una extrapolació de
              quilòmetres per sobre de l&apos;últim termòmetre.
            </p>
          )}
        </section>
      )}

      {/* ── Estacions d'alçada ── */}
      {stations.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            Les estacions per damunt dels {int(MOUNTAIN_M)} metres
          </h2>
          <div className="scroll-x">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Estació</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Alçada</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Temp.</th>
                  {anyChill && (
                    <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Es noten</th>
                  )}
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Ratxa</th>
                  {anySnow && (
                    <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Neu</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => {
                  const hard = s.gustKmh != null && s.gustKmh >= 61;
                  return (
                    <tr key={s.codi} className="border-b border-[var(--line-soft)]">
                      <td className="py-2 pr-4">
                        <Link href={`/estacions/${s.codi}`} className="text-[var(--ink-2)] no-underline hover:text-[var(--ink)]">
                          {s.nom}
                        </Link>
                        {s.comarcaNom && (
                          <span className="block text-[11px] text-[var(--muted)]">{s.comarcaNom}</span>
                        )}
                      </td>
                      <td className="tnum py-2 pr-4 text-[var(--muted)]">{int(s.altitud)} m</td>
                      <td className="tnum py-2 pr-4 font-medium text-[var(--ink)]">
                        {s.temperature != null ? `${num(s.temperature, 1)} °C` : '—'}
                      </td>
                      {anyChill && (
                        <td className="tnum py-2 pr-4 text-[var(--ink-2)]">
                          {s.windChill != null ? `${num(s.windChill, 0)} °C` : '—'}
                        </td>
                      )}
                      <td className="tnum py-2 pr-4">
                        {s.gustKmh != null ? (
                          <>
                            <span className={hard ? 'font-semibold' : ''} style={hard ? { color: 'var(--warn)' } : undefined}>
                              {s.gustKmh} km/h
                            </span>
                            <span className="ml-1.5 text-[11px] text-[var(--muted)]">
                              F{beaufort(s.gustKmh).force}
                              {s.windDir != null && ` · ${windCardinal(s.windDir)}`}
                            </span>
                          </>
                        ) : '—'}
                      </td>
                      {anySnow && (
                        <td className="tnum py-2 text-[var(--ink-2)]">
                          {s.snowCm != null && s.snowCm > 0 ? `${int(s.snowCm)} cm` : '—'}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {stations[0] && (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Lectures {ago(stations[0].ageMin)}. {data?.source}
            </p>
          )}
        </section>
      )}

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Els llindars, i d&apos;on surten
        </h2>
        <p>
          <strong className="font-medium text-[var(--ink)]">Força 6 (39 km/h)</strong> és on
          caminar de cara al vent deixa de ser còmode.{' '}
          <strong className="font-medium text-[var(--ink)]">Força 8 (62 km/h)</strong> és on costa
          mantenir-se dret — a la carena, amb un pendent al costat, ja no és qüestió
          de comoditat. Els llindars són els de l&apos;escala de Beaufort, en ús des de 1805.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">La sensació pel vent</strong> es
          calcula amb la fórmula de l&apos;índex nord-americà i canadenc, que només és
          vàlida per sota de 10 °C i amb més de 5 km/h. Fora d&apos;aquest rang la
          casella queda buida.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">La isoterma no és la cota de
          neu.</strong> La neu es fon mentre baixa, així que arriba blanca uns
          dos-cents o tres-cents metres per sota d&apos;on la temperatura creua el
          zero.
        </p>
        <p className="text-[var(--muted)]">
          Totes les dades són mesurades per les estacions automàtiques del Meteocat,
          no previstes. La predicció per als pròxims dies és a la pàgina de cada
          població.
        </p>
      </section>
    </article>
  );
}
