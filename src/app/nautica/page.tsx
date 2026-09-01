import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, nauticalConditions, periodMeaning } from '@/lib/activities';
import { douglas, FLAG_SHOW_HOURS, flagStyle } from '@/lib/sea';
import { windCardinal } from '@/lib/variables';
import { ago, hour, num } from '@/lib/format';

/**
 * Condicions per sortir a navegar.
 *
 * ## Què hi ha aquí que no hi hagi a `/mar`
 *
 * `/mar` respon «puc banyar-me»: banderes, temperatura de l'aigua, meduses. És
 * la pregunta de qui va a la platja.
 *
 * Aquesta respon «puc sortir», que és una altra: **vent i ratxa, període
 * d'onada, i com anirà l'onatge les pròximes hores**. El vent és el que decideix
 * si es surt, i a `/mar` no hi és.
 *
 * ## El vent és mesurat; l'onatge, modelat
 *
 * I es diu quin és quin. L'onatge ve d'Open-Meteo i és mar obert; el vent surt
 * de l'estació de la XEMA més propera a cada tram, amb el seu nom i la seva
 * distància — perquè un anemòmetre a vuit quilòmetres terra endins **no mesura
 * el vent que hi ha a l'aigua**, i qui navega ho sap millor que nosaltres.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Condicions per navegar: vent, onatge i període',
  description:
    'Vent mesurat, alçada i període de l’onada i temperatura de l’aigua a tota la '
    + 'costa catalana, tram a tram i de nord a sud.',
  alternates: { canonical: '/nautica' },
};

export default async function NauticaPage() {
  const data = await nauticalConditions();
  const stretches = data?.stretches ?? [];

  const winds = stretches
    .map((s) => s.wind?.gustKmh)
    .filter((v): v is number => v != null);
  const waves = stretches
    .map((s) => s.waveHeight)
    .filter((v): v is number => v != null);
  const maxGust = winds.length ? Math.max(...winds) : null;
  const maxWave = waves.length ? Math.max(...waves) : null;

  const flags = (data?.beaches ?? []).filter((b) => b.ageHours <= FLAG_SHOW_HOURS);
  const red = flags.filter((b) => b.flag === 'vermella').length;

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">Nàutica</span>
      </nav>

      <header className="mb-6 max-w-[65ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Es pot sortir a navegar?
        </h1>
        {stretches.length === 0 ? (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            Encara no hi ha dades del mar.
          </p>
        ) : (
          <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
            {maxGust != null && (
              <>
                La ratxa més forta de la costa són{' '}
                <strong className="tnum font-semibold text-[var(--ink)]">{maxGust} km/h</strong>
                {' '}—força {beaufort(maxGust).force}, {beaufort(maxGust).name}—.{' '}
              </>
            )}
            {maxWave != null && (
              <>
                L&apos;onada més grossa, de{' '}
                <span className="tnum font-medium text-[var(--ink)]">{num(maxWave, 2)} m</span>
                {' '}({douglas(maxWave)}).
              </>
            )}
            {red > 0 && (
              <> Hi ha <strong className="font-semibold" style={{ color: 'var(--cap-red)' }}>
                {red} {red === 1 ? 'platja amb bandera vermella' : 'platges amb bandera vermella'}
              </strong>.</>
            )}
          </p>
        )}
      </header>

      {stretches.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            La costa, de nord a sud
          </h2>
          <div className="scroll-x">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Vent mesurat, onatge modelat i temperatura de l&apos;aigua per trams de costa
              </caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Tram</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Vent <span className="font-normal normal-case">mesurat</span></th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Onada</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Període</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Màxima 24 h</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Aigua</th>
                </tr>
              </thead>
              <tbody>
                {stretches.map((s) => (
                  <tr key={s.near} className="border-b border-[var(--line-soft)]">
                    <td className="py-2 pr-4 text-[var(--ink-2)]">
                      {s.near}
                      {s.wind?.kmh != null && (
                        <span className="block text-[11px] text-[var(--muted)]">
                          {s.wind.station}, a {s.wind.distKm} km
                        </span>
                      )}
                    </td>
                    <td className="tnum py-2 pr-4">
                      {s.wind?.kmh != null ? (
                        <>
                          <span className="font-medium text-[var(--ink)]">{s.wind.kmh} km/h</span>
                          {s.wind.gustKmh != null && (
                            <span className="text-[var(--ink-2)]"> · ratxa {s.wind.gustKmh}</span>
                          )}
                          <span className="ml-1.5 text-[11px] text-[var(--muted)]">
                            F{beaufort(s.wind.gustKmh ?? s.wind.kmh).force}
                            {s.wind.direction != null && ` · ${windCardinal(s.wind.direction)}`}
                          </span>
                        </>
                      ) : (
                        <span className="text-[var(--muted)]">
                          {s.wind ? 'l’estació no dona vent' : 'cap estació a menys de 25 km'}
                        </span>
                      )}
                    </td>
                    <td className="tnum py-2 pr-4 text-[var(--ink-2)]">
                      {s.waveHeight != null ? (
                        <>
                          {num(s.waveHeight, 2)} m
                          <span className="ml-1.5 text-[11px] text-[var(--muted)]">{douglas(s.waveHeight)}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="tnum py-2 pr-4 text-[var(--ink-2)]">
                      {s.wavePeriod != null ? (
                        <>
                          {num(s.wavePeriod, 1)} s
                          <span className="ml-1.5 text-[11px] text-[var(--muted)]">{periodMeaning(s.wavePeriod)}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="tnum py-2 pr-4 text-[var(--muted)]">
                      {s.peak ? `${num(s.peak.height, 2)} m a les ${hour(s.peak.time)}` : '—'}
                    </td>
                    <td className="tnum py-2 font-medium text-[var(--ink)]">
                      {s.sst != null ? `${num(s.sst, 1)} °C` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {stretches[0]?.wind && (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              Vent mesurat {ago(stretches[0].wind.ageMin)} · Meteocat XEMA. Onatge i
              temperatura de l&apos;aigua, model marí d&apos;Open-Meteo.
            </p>
          )}
        </section>
      )}

      {flags.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Banderes vigents</h2>
          <p className="text-sm text-[var(--ink-2)]">
            {[...new Set(flags.map((b) => b.flag))]
              .map((f) => {
                const n = flags.filter((b) => b.flag === f).length;
                return `${n} ${n === 1 ? flagStyle(f).label.toLowerCase() : flagStyle(f).plural}`;
              })
              .join(', ')}
            .{' '}
            <Link href="/mar" className="text-[var(--accent)] no-underline hover:underline">
              Platja a platja ›
            </Link>
          </p>
          <p className="mt-2 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
            Les banderes són per al bany i les posa un socorrista mirant l&apos;aigua
            des de la sorra. No diuen res de com està el mar a una milla de la
            costa, que és el que mira aquesta pàgina.
          </p>
        </section>
      )}

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          El període és el número que la gent es salta
        </h2>
        <p>
          I és el que més diu: <strong className="font-medium text-[var(--ink)]">la mateixa
          alçada d&apos;onada és una cosa amb període curt i una altra amb període
          llarg</strong>. Sis segons són onades de vent, curtes i desordenades,
          incòmodes per a tot. Nou o més és mar de fons vinguda de lluny, llarga i
          regular: la que busca qui fa surf i la que menys molesta a qui navega.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">El vent d&apos;aquesta taula és
          mesurat, i a terra.</strong> Es diu de quina estació surt i a quina
          distància perquè importa: un anemòmetre a vuit quilòmetres terra endins
          no mesura el vent que hi ha a l&apos;aigua. Sol quedar-se curt, i amb vent de
          terra pot quedar-se molt curt.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">L&apos;onatge és d&apos;un model i és de
          mar obert.</strong> No sap res del que passa dins d&apos;una cala, ni de les
          corrents, ni del que fa la mar contra un espigó.
        </p>
        <p className="text-[var(--muted)]">
          Res d&apos;això és un butlletí oficial de navegació. Abans de sortir, la
          predicció marítima de l&apos;AEMET i el port. Aquí hi ha les dades, no un
          permís.
        </p>
      </section>
    </article>
  );
}
