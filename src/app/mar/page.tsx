import type { Metadata } from 'next';
import { windCardinal } from '@/lib/variables';
import { ago, dateTimeLong, num } from '@/lib/format';
import {
  allBeaches, douglas, flagStyle, parseJellyfish, seaPoints,
  FLAG_SHOW_HOURS,
} from '@/lib/sea';
import { FlagLegend, FlagMark, JellyfishMark } from '@/components/SeaMarks';
import { CoastMap, type CoastPoint } from '@/components/CoastMap';
import { mapOutline } from '@/lib/map';
import { ListFilter, groupsOf } from '@/components/ListFilter';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';

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

  /*
   * El mapa: cada punt del model amb la bandera de la platja que li dona nom.
   *
   * El creuament és pel nom perquè és l'únic que hi ha —`SeaPoint.near` surt
   * del registre de platges quan es construeix el punt— i si algun dia no
   * casa, el que passa és que el punt es dibuixa sense anell i sense enllaç.
   * Cap anell no és el mateix que cap bandera, i cap bandera és el que passa
   * fora de temporada: no s'inventa res en cap dels dos casos.
   */
  const byName = new Map(data.list.map((b) => [b.name, b]));
  const geo = mapOutline();
  const coast: CoastPoint[] = (sea?.points ?? []).map((p) => {
    const beach = byName.get(p.near);
    const fresh = beach && beach.ageHours <= FLAG_SHOW_HOURS ? beach : null;
    return {
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      near: p.near,
      sst: p.sst[sea!.index] ?? null,
      wave: p.waveHeight[sea!.index] ?? null,
      flag: fresh?.flag ?? null,
      beachCode: beach?.code ?? null,
    };
  });

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

  const flagsSorted = [...byFlag].sort((a, b) => b[1] - a[1]);
  const maxWave = waves.length ? Math.max(...waves) : null;
  const red = recent.filter((b) => flagStyle(b.flag).label === 'Vermella').length;

  return (
    <article data-wide>
      <PageHero
        crumbs={[{ nom: 'Catalunya', path: '/' }, { nom: 'El mar', path: '/mar' }]}
        eyebrow="Platges i mar"
        icon="tide-high"
        title="Es pot fer un bany?"
        lead={recent.length > 0 ? (
          <>
            <strong>{recent.length} platges</strong> tenen parte de les últimes {FLAG_SHOW_HOURS} hores
            {flagsSorted.length > 0 && (
              <>: {flagsSorted
                .map(([f, n]) => `${n} ${n === 1 ? flagStyle(f).label.toLowerCase() : flagStyle(f).plural}`)
                .join(', ')}</>
            )}.
            {jelly.length > 0 && (
              <> {jelly.length === 1 ? 'Una ha' : `${jelly.length} han`} reportat meduses.</>
            )}
          </>
        ) : (
          <>
            Ara mateix cap platja té parte recent. Les banderes les posen els socorristes quan
            són de servei, i de nit i fora de temporada no se&apos;n publica cap de nova.
          </>
        )}
        stats={[
          temps.length > 0 && {
            label: 'Aigua', icon: 'thermometer',
            value: `${num(Math.min(...temps), 0)}–${num(Math.max(...temps), 0)}`, unit: '°C',
            sub: 'de la més freda a la més càlida',
          },
          maxWave != null && {
            label: 'Onada màxima', icon: 'tide-high', value: num(maxWave, 1), unit: 'm',
            sub: `mar ${douglas(maxWave)}`,
          },
          recent.length > 0 && {
            label: 'Bany prohibit', icon: 'code-red', value: String(red),
            sub: red === 1 ? 'platja amb bandera vermella' : 'platges amb bandera vermella',
          },
          jelly.length > 0 && {
            label: 'Meduses', value: String(jelly.length),
            sub: jelly.length === 1 ? "platja n'ha reportat" : "platges n'han reportat",
          },
        ]}
        note={(
          <>
            La bandera la posa un socorrista mirant l&apos;aigua, i només n&apos;hi ha on hi ha
            servei de salvament. L&apos;aigua i l&apos;onatge surten d&apos;un model: cobreixen tota
            la costa i totes les hores, però no recullen les corrents de ressaca.
          </>
        )}
        aside={coast.length > 0 && (
          <section className="card" aria-label="La costa, ara">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/tide-high.svg" width={22} height={22} alt="" />
              La costa, ara
            </p>
            <CoastMap
              outline={geo.features}
              projection={geo.projection}
              width={geo.width}
              height={geo.height}
              points={coast}
            />
            {recent.length > 0 && (
              <div className="mt-3 border-t border-[var(--line-soft)] pt-3">
                <FlagLegend flags={recent.map((b) => b.flag)} />
              </div>
            )}
          </section>
        )}
      />

      {/*
        * ── Banderes ──
        *
        * El filtre és per bandera i no per costa: les costes ja són les
        * seccions, amb el seu títol i el seu recompte. El que cap agrupació no
        * contesta és «on no em puc banyar», i això és el color.
        *
        * Amb un sol color —115 verdes, que és el normal— `ListFilter` no
        * dibuixa res: el filtre apareix el dia que hi ha alguna cosa a filtrar.
        */}
      {recent.length > 0 && (
        <Section id="banderes" title="Les banderes d'ara">
          <ListFilter
            id="fm"
            groups={flagGroups}
            legend="Filtra per bandera"
            allLabel="Totes les banderes"
          >
            {[...byCoast].map(([coastName, list]) => (
              <section key={coastName} className="lf-section mb-6">
                <h3 className="card-label">
                  {coastName}
                  <span className="lf-total"> · {list.length}</span>
                </h3>
                <ul className="card-grid">
                  {list.map((b) => {
                    const style = flagStyle(b.flag);
                    const jellies = parseJellyfish(b.jellyfish);
                    return (
                      <li
                        key={b.code}
                        data-lf={b.flag}
                        className="rounded-2xl border border-[var(--glass-line)] bg-[var(--glass)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0">
                            <span className="row-title">{b.name}</span>
                            <span className="row-sub">{b.municipality}</span>
                          </span>
                          <span
                            className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-[var(--ink-2)]"
                            style={{ opacity: b.ageHours <= 3 ? 1 : 0.55 }}
                          >
                            <FlagMark flag={b.flag} size={22} />
                            {style.label}
                          </span>
                        </div>
                        <p className="mt-1.5 text-xs text-[var(--muted)]">
                          {[b.seaState && `mar ${b.seaState}`, b.temperature && `aigua a ${b.temperature} °C`]
                            .filter(Boolean).join(' · ')}
                          {(b.seaState || b.temperature) && ' · '}{ago(b.ageHours * 60)}
                        </p>
                        {jellies.length > 0 && (
                          <div className="mt-2 space-y-1">
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
        </Section>
      )}

      {/* ── El model, de nord a sud ── */}
      {strip.length > 0 && (
        <Section id="onatge" title="L'aigua i l'onatge, de nord a sud">
          <div className="card scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Tram, davant de</th>
                  <th scope="col" className="num">Aigua</th>
                  <th scope="col" className="num">Onada</th>
                  <th scope="col" className="num">Període</th>
                  <th scope="col">D&apos;on ve</th>
                </tr>
              </thead>
              <tbody>
                {strip.map((s) => (
                  <tr key={s.near}>
                    <td>{s.near}</td>
                    <td className="num font-medium text-[var(--ink)]">
                      {s.sst != null ? `${num(s.sst, 1)} °C` : '—'}
                    </td>
                    <td className="num">
                      {s.wave != null ? (
                        <>
                          {num(s.wave, 2)} m
                          <span className="ml-1.5 text-[11px] text-[var(--muted)]">{douglas(s.wave)}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="num text-[var(--muted)]">
                      {s.period != null ? `${num(s.period, 1)} s` : '—'}
                    </td>
                    <td className="text-[var(--muted)]">
                      {s.dir != null ? windCardinal(s.dir) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="source">
              Model d&apos;onatge i temperatura de l&apos;aigua a uns cinc quilòmetres de la costa
              {sea && sea.points[0] && <>, de {dateTimeLong(sea.points[0].times[sea.index])}</>}.
              Estat de la mar amb l&apos;escala Douglas.
            </p>
          </div>
        </Section>
      )}

      <Section id="platges" title={`Les ${registry.length} platges, poble a poble`}>
        <div className="card">
          <p className="mb-3 text-sm text-[var(--muted)]">
            Amb el dia de l&apos;últim parte. La bandera només hi surt quan és de les últimes{' '}
            {FLAG_SHOW_HOURS} hores.
          </p>
          <ListFilter
            id="fp"
            groups={townGroups}
            legend="Filtra per municipi"
            allLabel="Tots els municipis"
          >
            <div className="scroll-x">
              <table className="data-table">
                <caption className="sr-only">
                  Registre de platges de Catalunya, per municipi
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Platja</th>
                    <th scope="col">Municipi</th>
                    <th scope="col">Costa</th>
                    <th scope="col">Últim parte</th>
                  </tr>
                </thead>
                <tbody>
                  {registry.map((b) => {
                    const shown = b.ageHours <= FLAG_SHOW_HOURS;
                    return (
                      <tr key={b.code} id={`p-${b.code}`} data-lf={b.municipalityIne5}>
                        <td className="text-[var(--ink)]">{b.name}</td>
                        <td>{b.municipality}</td>
                        <td className="text-[var(--muted)]">{b.coast}</td>
                        <td className="text-[var(--muted)]">
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
          <p className="source">{data.source}.</p>
        </div>
      </Section>

      <div className="section">
        <Fold
          id="que-vol-dir"
          title="Què vol dir cada dada, i què no"
          summary="La bandera caduca, l'onatge és de mar obert i les meduses porten el nom científic"
        >
          <div className="card prose">
            <p>
              <strong>Una bandera caduca.</strong> La posa un socorrista quan és de servei, i fora
              d&apos;horari no s&apos;actualitza: la que consta pot ser de fa hores. Per això cada una
              porta l&apos;hora del seu parte, i les de més de {FLAG_SHOW_HOURS} hores no surten.
            </p>
            <p>
              <strong>L&apos;onatge del model és de mar obert</strong>, a uns cinc quilòmetres de la
              costa. No recull el que passa dins d&apos;una cala ni les corrents de ressaca, que són
              la causa principal dels ofegaments: mig metre d&apos;onada pot ser una platja tranquil·la
              o una on no s&apos;hi ha d&apos;entrar, segons el fons.
            </p>
            <p>
              <strong>Les meduses</strong> les reporten els socorristes amb el nom científic. Al
              costat hi va el nom corrent i què se&apos;n sap de la picada; una espècie que no
              consti a la taula surt com a desconeguda i s&apos;ha de tractar com si piqués.
            </p>
          </div>
        </Fold>
      </div>
    </article>
  );
}
