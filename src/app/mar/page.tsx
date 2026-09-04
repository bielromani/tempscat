import type { Metadata } from 'next';
import Link from 'next/link';
import { windCardinal } from '@/lib/variables';
import { ago, dateTimeLong, num } from '@/lib/format';
import {
  allBeaches, douglas, flagStyle, parseJellyfish, seaPoints,
  FLAG_SHOW_HOURS,
} from '@/lib/sea';
import { FlagLegend, FlagMark, JellyfishMark } from '@/components/SeaMarks';
import { ListFilter, groupsOf } from '@/components/ListFilter';

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
 *
 * ## Y el registro entero, siempre
 *
 * Fuera de temporada `recent` está **vacío** —ningún socorrista de servicio,
 * ninguna bandera de menos de doce horas— y la página se quedaba sin una sola
 * playa: un resultado del buscador llegaba a `/mar#p-…` y no encontraba nada
 * donde aterrizar. La tabla de abajo lleva las 229 con su municipio y la fecha
 * de su último parte, y **la bandera solo cuando es reciente**: lo que se retira
 * fuera de horario es el color, no la playa.
 *
 * Agrupa por municipio y no por tramo de costa porque «què hi ha al Maresme» no
 * es la pregunta que se hace nadie.
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

  const flagGroups = groupsOf(recent, (b) => (
    b.flag ? { key: b.flag, label: flagStyle(b.flag).label } : null
  ));

  /*
   * El registre sencer, ordenat de nord a sud dins de cada municipi.
   *
   * Existeix per dues raons. La primera és que fora de temporada `recent` és
   * **buit** —cap socorrista de servei, cap bandera de menys de dotze hores— i
   * la pàgina es quedava sense ni una platja: un resultat del cercador hi
   * arribava i no trobava res. La segona és que agrupar per tram de costa
   * contesta «què hi ha al Maresme» i no «què hi ha al meu poble», que és la
   * pregunta.
   *
   * Aquí no hi ha cap bandera caducada fent-se passar per bandera: hi ha el
   * nom, el municipi i **quan va ser l'últim parte**. La bandera només surt
   * quan és de les últimes {FLAG_SHOW_HOURS} hores, igual que a dalt.
   */
  const registry = data.list
    .slice()
    .sort((a, b) => a.municipality.localeCompare(b.municipality, 'ca')
      || a.name.localeCompare(b.name, 'ca'));

  const townGroups = groupsOf(registry, (b) => (
    b.municipality ? { key: b.municipalityIne5, label: b.municipality } : null
  ));

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
          <strong className="font-medium text-[var(--ink-2)]">La bandera la posa un socorrista
          mirant l&apos;aigua</strong>, i només n&apos;hi ha on hi ha servei de
          salvament. L&apos;onatge i la temperatura de sota surten d&apos;un model: cobreixen
          tota la costa i totes les hores, però no recullen les corrents de
          ressaca.
        </p>
      </header>

      {recent.length > 0 && (
        <section className="mb-6 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] px-4 py-3">
          <FlagLegend flags={recent.map((b) => b.flag)} />
        </section>
      )}

      {/*
        * ── Banderas ──
        *
        * El filtro es por bandera y no por costa: las costas ya son las
        * secciones, con su título y su recuento. Lo que ninguna agrupación
        * responde es «on no em puc banyar», y eso es el color.
        *
        * Con un solo color —115 verdes, que es lo normal— `ListFilter` no
        * dibuja nada: el filtro aparece el día que hay algo que filtrar.
        */}
      <ListFilter
        id="fm"
        groups={flagGroups}
        legend="Filtra per bandera"
        allLabel="Totes les banderes"
      >
      {[...byCoast].map(([coast, list]) => (
        <section key={coast} className="lf-section mb-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            {coast}
            <span className="lf-total"> · {list.length}</span>
          </h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((b) => {
              const style = flagStyle(b.flag);
              const jellies = parseJellyfish(b.jellyfish);
              return (
                <li
                  key={b.code}
                  data-lf={b.flag}
                  className="rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-[var(--ink)]">{b.name}</span>
                      <span className="block truncate text-xs text-[var(--muted)]">
                        {b.municipality}
                      </span>
                    </span>
                    <span
                      className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--ink-2)]"
                      style={{ opacity: b.ageHours <= 3 ? 1 : 0.55 }}
                    >
                      <FlagMark flag={b.flag} size={20} />
                      {style.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {[b.seaState && `mar ${b.seaState}`, b.temperature && `${b.temperature} °C`]
                      .filter(Boolean).join(' · ')}
                    {' · '}{ago(b.ageHours * 60)}
                  </p>
                  {jellies.length > 0 && (
                    <div className="mt-1.5 space-y-1">
                      {jellies.map((j) => (
                        <JellyfishMark key={j.species} species={j.species} amount={j.amount} />
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      </ListFilter>

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

      <section className="mt-8">
        <h2 className="mb-1 text-lg font-semibold tracking-tight">
          Totes les platges, poble a poble
        </h2>
        <p className="mb-3 max-w-[65ch] text-sm leading-relaxed text-[var(--muted)]">
          Les {registry.length} platges del registre, amb el dia de l&apos;últim parte.
          La bandera només hi surt quan és de les últimes {FLAG_SHOW_HOURS} hores: la
          d&apos;abans-d&apos;ahir no diu res de com està l&apos;aigua avui.
        </p>

        <ListFilter
          id="fp"
          groups={townGroups}
          legend="Filtra per municipi"
          allLabel="Tots els municipis"
        >
          <div className="scroll-x">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Registre de platges de Catalunya, per municipi
              </caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Platja</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Municipi</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Costa</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Últim parte</th>
                </tr>
              </thead>
              <tbody>
                {registry.map((b) => {
                  const shown = b.ageHours <= FLAG_SHOW_HOURS;
                  return (
                    <tr
                      key={b.code}
                      id={`p-${b.code}`}
                      data-lf={b.municipalityIne5}
                      className="border-b border-[var(--line-soft)]"
                    >
                      <td className="py-2 pr-4 text-[var(--ink)]">{b.name}</td>
                      <td className="py-2 pr-4 text-[var(--ink-2)]">{b.municipality}</td>
                      <td className="py-2 pr-4 text-[var(--muted)]">{b.coast}</td>
                      <td className="py-2 text-[var(--muted)]">
                        {shown ? (
                          <span className="flex items-center gap-1.5 text-[var(--ink-2)]">
                            <FlagMark flag={b.flag} size={16} />
                            {flagStyle(b.flag).label}
                            <span className="text-[var(--muted)]">· {ago(b.ageHours * 60)}</span>
                          </span>
                        ) : (
                          <span className="text-xs">{dateTimeLong(b.at)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ListFilter>
      </section>

      <section className="mt-8 max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        <h2 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
          Què vol dir i què no
        </h2>
        <p>
          <strong className="font-medium text-[var(--ink)]">Una bandera caduca.</strong> La posa un
          socorrista quan és de servei, i fora d&apos;horari no s&apos;actualitza: la
          que consta pot ser de fa hores. Per això cada una porta l&apos;hora del
          seu parte, i les de més de {FLAG_SHOW_HOURS} hores no surten.
        </p>
        <p>
          <strong className="font-medium text-[var(--ink)]">L&apos;onatge del model és de mar
          obert</strong>, calculat a uns cinc quilòmetres de la costa. No recull el
          que passa dins d&apos;una cala ni les corrents de ressaca, que són la causa
          principal dels ofegaments. Mig metre d&apos;onada pot ser una platja
          tranquil·la o una on no s&apos;hi ha d&apos;entrar, segons el fons.
        </p>
        <p>
          Les <strong className="font-medium text-[var(--ink)]">meduses</strong> les reporten els
          socorristes amb el nom científic. Al costat hi va el nom corrent i què
          se&apos;n sap de la picada; una espècie que no tinguem fitxada surt com a
          desconeguda i s&apos;ha de tractar com si piqués.
        </p>
        <p className="text-[var(--muted)]">
          {data.source}. Hi ha {data.list.length} platges al registre i totes surten a la
          taula de sobre; el que no surt fora d&apos;horari és la bandera. Estat de la
          mar amb l&apos;escala Douglas, la mateixa dels partes marítims.
          {sea && sea.points[0] && (
            <> Model d&apos;onatge de {dateTimeLong(sea.points[0].times[sea.index])}.</>
          )}
        </p>
      </section>
    </article>
  );
}
