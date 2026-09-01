import type { Metadata } from 'next';
import Link from 'next/link';
import { dateFull, dateShort, int, relativeDay } from '@/lib/format';
import { allHistory, localToday } from '@/lib/weather';
import { stationByCodi } from '@/lib/territory';

/**
 * La nieve del Pirineo: medida, no estimada.
 *
 * Hasta ahora la nieve del sitio era la **cota** calculada a partir de la isocero
 * del modelo — una estimación. Esto es un espesor medido por un sensor, con su
 * fecha. Las dos juntas contestan la pregunta de verdad: «la cota va a 1.800 m i
 * a Bonaigua hi ha 40 cm».
 *
 * ## Por qué la página funciona también en agosto
 *
 * Un panel de nieve que en verano se queda vacío es una página muerta ocho meses
 * al año. Aquí, cuando no hay nieve, cada estación enseña **cuándo tuvo la
 * última** y **cuánta llegó a haber**: en agosto eso sigue siendo información, y
 * en enero pasa a segundo plano sin que haya que tocar nada.
 *
 * Solo 24 de las 189 estaciones tienen sensor de nieve. Las otras 165 no salen —
 * no con un cero, que es lo que pasaría si se confundiera «no mide» con «no hay».
 */
export const revalidate = 1800;

export const metadata: Metadata = {
  title: 'Gruix de neu al Pirineu, mesurat',
  description:
    'Quanta neu hi ha ara mateix a les estacions d\'alta muntanya de la XEMA: '
    + 'gruix mesurat, neu nova i rècords de cada estació.',
  alternates: { canonical: '/neu' },
};

export default async function NeuPage() {
  const today = localToday();

  const rows = (await allHistory())
    .map((h) => {
      const station = stationByCodi(h.station);
      if (!station?.operativa || !h.snow) return null;
      return { h, station, snow: h.snow };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => {
      // Primero las que tienen nieve ahora; entre las que no, las más altas.
      if ((b.snow.depthCm > 0 ? 1 : 0) !== (a.snow.depthCm > 0 ? 1 : 0)) {
        return (b.snow.depthCm > 0 ? 1 : 0) - (a.snow.depthCm > 0 ? 1 : 0);
      }
      if (b.snow.depthCm !== a.snow.depthCm) return b.snow.depthCm - a.snow.depthCm;
      return (b.station.altitud ?? 0) - (a.station.altitud ?? 0);
    });

  const withSnow = rows.filter((r) => r.snow.depthCm > 0);

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Neu</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Quanta neu hi ha, de veritat
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          {withSnow.length > 0 ? (
            <>
              <strong className="font-semibold text-[var(--ink)]">
                {withSnow.length} {withSnow.length === 1 ? 'estació té' : 'estacions tenen'} neu
              </strong>{' '}
              ara mateix, de les {rows.length} que la mesuren. El gruix més alt és de{' '}
              <span className="tnum">{int(withSnow[0].snow.depthCm)} cm</span>, a{' '}
              {withSnow[0].station.nom}.
            </>
          ) : (
            <>
              Ara mateix <strong className="font-semibold text-[var(--ink)]">no hi ha neu</strong> a
              cap de les {rows.length} estacions que la mesuren. A sota, quan en va
              tenir cada una i quanta n&apos;hi ha arribat a haver.
            </>
          )}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          Això és gruix <strong className="font-medium text-[var(--ink-2)]">mesurat per un
          sensor</strong>, no la cota de neu estimada que surt a les fitxes: la cota
          diu per damunt de quina altura nevarà, i això diu quanta n&apos;hi ha. Només{' '}
          {rows.length} estacions en servei porten sensor de neu, i les altres no
          surten — no amb un zero, que voldria dir una cosa que no sabem.
        </p>
      </header>

      <div className="scroll-x">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Estació</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Altitud</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Gruix</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Mesurat</th>
              <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Rècord de la sèrie</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ h, station, snow }) => {
              const rec = h.records.snowMax;
              return (
                <tr key={station.codi} className="border-b border-[var(--line-soft)]">
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/estacions/${station.codi}`}
                      className="text-[var(--ink)] no-underline hover:underline"
                    >
                      {station.nom}
                    </Link>
                    {station.comarcaNom && (
                      <span className="block text-xs text-[var(--muted)]">{station.comarcaNom}</span>
                    )}
                  </td>
                  <td className="tnum py-2.5 pr-4 text-[var(--muted)]">
                    {station.altitud != null ? `${int(station.altitud)} m` : '—'}
                  </td>
                  <td className="tnum py-2.5 pr-4">
                    {snow.depthCm > 0 ? (
                      <span
                        className="rounded px-2 py-0.5 font-semibold"
                        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                      >
                        {int(snow.depthCm)} cm
                      </span>
                    ) : (
                      <span className="text-[var(--line)]">sense neu</span>
                    )}
                    {snow.newCm != null && snow.newCm > 0 && (
                      <span className="ml-2 text-xs text-[var(--good)]">
                        +{int(snow.newCm)} de nova
                      </span>
                    )}
                  </td>
                  <td className="tnum py-2.5 pr-4 text-xs text-[var(--muted)]">
                    {relativeDay(snow.day, today) === 'avui'
                      ? 'avui'
                      : dateShort(snow.day)}
                  </td>
                  <td className="tnum py-2.5 text-xs text-[var(--muted)]">
                    {rec ? `${int(rec.value)} cm · ${dateFull(rec.date)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <p className="mt-6 text-[var(--muted)]">
          Encara no hi ha dades de neu carregades. Apareixen quan el worker
          d&apos;històric hagi corregut.
        </p>
      )}

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Què vol dir i què no
        </h2>
        <p>
          El gruix és el <strong className="font-medium text-[var(--ink)]">màxim del dia</strong> a
          l&apos;emplaçament del sensor, que és un punt concret i normalment planer.
          A cinquanta metres, en un obac o en una congesta, n&apos;hi pot haver el
          doble; en una carena escombrada pel vent, gens.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">No és l&apos;estat de les pistes.</strong>{' '}
          Les estacions d&apos;esquí innaven, compacten i acumulen, i el gruix d&apos;una
          pista no té gaire a veure amb el d&apos;un prat a la mateixa cota. Per a
          això, la font són les mateixes estacions d&apos;esquí.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">Hi ha lectures que descartem.</strong>{' '}
          El sensor és un ultrasò que mesura la distància fins a terra, i a
          l&apos;estiu s&apos;hi cola qualsevol cosa: herba que creix, un objecte, una
          recalibració. El registre donava 12 cm de neu a Das el 28 d&apos;agost, a
          1.100 m, amb la mínima d&apos;aquell dia a 9,3 °C — i el portal les marca
          com a bones. Descartem el gruix que <em>augmenta</em> un dia en què no ha
          glaçat, que és l&apos;únic cas físicament impossible; la neu que es fon un
          dia assolellat de primavera es queda.
        </p>
        <p className="text-[var(--muted)]">
          Dades del Servei Meteorològic de Catalunya (XEMA), variable de gruix
          màxim diari. La sèrie de cada estació arrenca quan es va instal·lar el
          sensor, que no és quan es va instal·lar l&apos;estació.
        </p>
      </section>
    </article>
  );
}
