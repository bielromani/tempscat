import type { Metadata } from 'next';
import Link from 'next/link';
import { windCardinal } from '@/lib/variables';
import { ago, dateTimeLong, num } from '@/lib/format';
import {
  allBeaches, douglas, flagStyle, parseJellyfish, seaPoints,
  FLAG_SHOW_HOURS,
} from '@/lib/sea';

/**
 * El mar: banderas de playa y estado del agua.
 *
 * La página existe para poner una al lado de la otra dos cosas que la gente
 * mezcla: **la bandera la pone una persona mirando el agua** y solo existe donde
 * hay socorrista de servicio; **el oleaje y la temperatura salen de un modelo** y
 * están en toda la costa, también de noche y también en enero.
 *
 * La bandera gana siempre que exista y sea reciente. El modelo es lo que queda
 * cuando no la hay.
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Banderes de platja i estat del mar a Catalunya',
  description:
    'Quina bandera hi ha a cada platja, amb l’hora del parte, i la temperatura de '
    + 'l’aigua i l’onatge a tota la costa catalana.',
  alternates: { canonical: '/mar' },
};

export default async function MarPage() {
  const data = await allBeaches();
  const sea = await seaPoints();

  if (!data?.list.length) {
    return (
      <article>
        <h1 className="text-3xl font-semibold tracking-tight">El mar</h1>
        <p className="mt-4 text-[var(--muted)]">
          Encara no hi ha dades descarregades. Apareixen quan el worker del mar
          hagi corregut per primera vegada.
        </p>
      </article>
    );
  }

  const recent = data.list.filter((b) => b.ageHours <= FLAG_SHOW_HOURS);

  const byFlag = new Map<string, number>();
  for (const b of recent) byFlag.set(b.flag, (byFlag.get(b.flag) ?? 0) + 1);

  const jelly = recent.filter((b) => b.jellyfish);

  // Agua y oleaje ahora mismo, de norte a sur.
  const strip = sea
    ? sea.points
      .slice()
      .sort((a, b) => b.lat - a.lat)
      .map((p) => ({
        near: p.near,
        sst: p.sst[sea.index] ?? null,
        wave: p.waveHeight[sea.index] ?? null,
        period: p.wavePeriod[sea.index] ?? null,
        dir: p.waveDirection[sea.index] ?? null,
      }))
    : [];

  const temps = strip.map((s) => s.sst).filter((v): v is number => v != null);
  const waves = strip.map((s) => s.wave).filter((v): v is number => v != null);

  const byCoast = new Map<string, typeof recent>();
  for (const b of recent) {
    const arr = byCoast.get(b.coast) ?? [];
    arr.push(b);
    byCoast.set(b.coast, arr);
  }

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">El mar</span>
      </nav>

      <header className="mb-6 max-w-[65ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Es pot fer un bany?
        </h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          {recent.length > 0 ? (
            <>
              <strong className="font-semibold text-[var(--ink)]">{recent.length} platges</strong>{' '}
              tenen parte de les últimes {FLAG_SHOW_HOURS} hores
              {byFlag.size > 0 && (
                <>: {[...byFlag].sort((a, b) => b[1] - a[1])
                  .map(([f, n]) => `${n} ${n === 1 ? flagStyle(f).label.toLowerCase() : flagStyle(f).plural}`)
                  .join(', ')}</>
              )}.
              {jelly.length > 0 && (
                <> {jelly.length === 1 ? 'Una ha' : `${jelly.length} han`} reportat meduses.</>
              )}
            </>
          ) : (
            <>
              Ara mateix cap platja té parte recent. Les banderes les posen els
              socorristes quan són de servei — de nit i fora de temporada no
              se&apos;n publica cap de nova.
            </>
          )}
          {temps.length > 0 && (
            <> L&apos;aigua va dels{' '}
              <span className="tnum font-medium text-[var(--ink)]">{num(Math.min(...temps), 1)} °C</span>{' '}
              als{' '}
              <span className="tnum font-medium text-[var(--ink)]">{num(Math.max(...temps), 1)} °C</span>
              {waves.length > 0 && `, amb onades de fins a ${num(Math.max(...waves), 2)} m`}.
            </>
          )}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          <strong className="font-medium text-[var(--ink-2)]">La bandera la posa una persona
          que està mirant l&apos;aigua.</strong> És el que val, i només existeix on hi
          ha socorrista i mentre és de servei. L&apos;onatge i la temperatura de sota
          surten d&apos;un model: hi són sempre i a tota la costa, però no saben res
          de les corrents de ressaca.
        </p>
      </header>

      {/* ── Banderas ── */}
      {[...byCoast].map(([coast, list]) => (
        <section key={coast} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {coast} · {list.length}
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((b) => {
              const style = flagStyle(b.flag);
              const j = parseJellyfish(b.jellyfish);
              return (
                <li
                  key={b.code}
                  className="rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-[var(--ink)]">{b.name}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {b.municipality}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold"
                      style={{ background: style.color, color: style.ink, opacity: b.ageHours <= 3 ? 1 : 0.55 }}
                    >
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {[b.seaState && `mar ${b.seaState}`, b.temperature && `${b.temperature} °C`]
                      .filter(Boolean).join(' · ')}
                    {' · '}{ago(b.ageHours * 60)}
                  </p>
                  {j && (
                    <p className="mt-0.5 text-[11px]" style={{ color: 'var(--warn)' }}>
                      <span className="italic">{j.species}</span>
                      {j.amount && `, ${j.amount}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* ── Modelo, de norte a sur ── */}
      {strip.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            L&apos;aigua i l&apos;onatge, de nord a sud
          </h2>
          <div className="scroll-x">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Tram, davant de</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Aigua</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Onada</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Període</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">D&apos;on ve</th>
                </tr>
              </thead>
              <tbody>
                {strip.map((s) => (
                  <tr key={s.near} className="border-b border-[var(--line-soft)]">
                    <td className="py-2 pr-4 text-[var(--ink-2)]">{s.near}</td>
                    <td className="tnum py-2 pr-4 font-medium text-[var(--ink)]">
                      {s.sst != null ? `${num(s.sst, 1)} °C` : '—'}
                    </td>
                    <td className="tnum py-2 pr-4 text-[var(--ink-2)]">
                      {s.wave != null ? (
                        <>
                          {num(s.wave, 2)} m
                          <span className="ml-1.5 text-[11px] text-[var(--muted)]">{douglas(s.wave)}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="tnum py-2 pr-4 text-[var(--muted)]">
                      {s.period != null ? `${num(s.period, 1)} s` : '—'}
                    </td>
                    <td className="py-2 text-[var(--muted)]">
                      {s.dir != null ? windCardinal(s.dir) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Què vol dir i què no
        </h2>
        <p>
          <strong className="font-medium text-[var(--ink)]">Una bandera caduca.</strong> Aquí surt
          sempre amb l&apos;hora del parte, i les de més de {FLAG_SHOW_HOURS} hores no
          surten: ensenyar una verda d&apos;abans-d&apos;ahir com si fos d&apos;ara és el
          pitjor que podria fer aquesta pàgina, perquè algú es fica a l&apos;aigua pel
          que diu un web.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">L&apos;onatge del model és de mar
          obert.</strong> A cinc quilòmetres de la costa i sense saber res del que
          passa dins d&apos;una cala ni de les corrents de ressaca, que és el que de
          debò s&apos;emporta la gent. Mig metre d&apos;onada pot ser una platja tranquil·la
          o una on no s&apos;hi ha d&apos;entrar, segons el fons.
        </p>
        <p>
          Les <strong className="font-medium text-[var(--ink)]">meduses</strong> es reporten amb el
          nom científic, i no el traduïm: «Pelagia noctiluca» és el que permet
          buscar si pica, i els noms populars canvien d&apos;una cala a l&apos;altra.
        </p>
        <p className="text-[var(--muted)]">
          {data.source}. En total hi ha {data.list.length} platges al registre; les
          que no tenen parte recent no surten. Estat de la mar amb l&apos;escala
          Douglas, la mateixa dels partes marítims.
          {sea && sea.points[0] && (
            <> Model d&apos;onatge de {dateTimeLong(sea.points[0].times[sea.index])}.</>
          )}
        </p>
      </section>
    </article>
  );
}
