import type { Metadata } from 'next';
import { windCardinal } from '@/lib/variables';
import { ago, articleFirst, dateTiny, dateTimeLong, deName, fromDirection, num } from '@/lib/format';
import { temperatureColor, temperatureInk } from '@/lib/scales';
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
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

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

  /*
   * La platja de cada punt del model.
   *
   * `SeaPoint.near` és el nom de la platja que li dona nom, però els noms es
   * repeteixen —hi ha més d'una «Platja Gran»— i buscant només pel nom el punt
   * de Palamós queia al Maresme. Es pren, d'entre les que porten aquell nom, la
   * més propera al punt. Si no n'hi ha cap, el punt queda sense costa i sense
   * anell, i no s'inventa res.
   */
  const beachOf = (p: { near: string; lat: number; lon: number }) => {
    let best: (typeof data.list)[number] | null = null;
    let bestD = Infinity;
    for (const b of data.list) {
      if (b.name !== p.near) continue;
      const d = (b.lat - p.lat) ** 2 + ((b.lon - p.lon) * Math.cos((p.lat * Math.PI) / 180)) ** 2;
      if (d < bestD) { bestD = d; best = b; }
    }
    return best;
  };

  // L'aigua i l'onatge d'ara, de nord a sud, amb la costa de cada tram.
  const strip = sea
    ? sea.points
      .slice()
      .sort((a, b) => b.lat - a.lat)
      .map((p) => ({
        near: p.near,
        coast: beachOf(p)?.coast || 'Altres trams',
        sst: p.sst[sea.index] ?? null,
        wave: p.waveHeight[sea.index] ?? null,
        period: p.wavePeriod[sea.index] ?? null,
        dir: p.waveDirection[sea.index] ?? null,
      }))
    : [];

  /*
   * Els trams per costa, i les costes de nord a sud.
   *
   * Fins al 6 d'octubre de 2026 era una taula de cinc columnes i vint files: al
   * mòbil cada xifra es partia en dues línies («21,6 / °C») i calia arrossegar
   * de costat per veure el període. Agrupada per costa es llegeix com es
   * pregunta —«com està la Costa Brava»— i cada fila hi cap sencera.
   */
  const coasts = new Map<string, typeof strip>();
  for (const s of strip) {
    const arr = coasts.get(s.coast) ?? [];
    arr.push(s);
    coasts.set(s.coast, arr);
  }

  const geo = mapOutline();
  const coast: CoastPoint[] = (sea?.points ?? []).map((p) => {
    const beach = beachOf(p);
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

  // Els extrems, amb el seu lloc: la pregunta que ve després de «22 °C» és «on».
  const withSst = strip.filter((s) => s.sst != null);
  const withWave = strip.filter((s) => s.wave != null);
  const warmest = withSst.reduce<(typeof strip)[number] | null>((a, s) => (!a || s.sst! > a.sst! ? s : a), null);
  const coldest = withSst.reduce<(typeof strip)[number] | null>((a, s) => (!a || s.sst! < a.sst! ? s : a), null);
  const roughest = withWave.reduce<(typeof strip)[number] | null>((a, s) => (!a || s.wave! > a.wave! ? s : a), null);
  const calmest = withWave.reduce<(typeof strip)[number] | null>((a, s) => (!a || s.wave! < a.wave! ? s : a), null);

  const flagGroups = groupsOf(recent, (b) => (
    b.flag ? { key: b.flag, label: flagStyle(b.flag).label } : null
  ));

  /*
   * El registre sencer, ordenat per municipi.
   *
   * Existeix per dues raons. La primera és que fora de temporada `recent` és
   * **buit** —cap socorrista de servei, cap bandera de menys de dotze hores— i
   * la pàgina es quedava sense ni una platja: un resultat del cercador hi
   * arribava (`/mar#p-…`) i no trobava res. La segona és que agrupar per tram
   * de costa contesta «què hi ha al Maresme» i no «què hi ha al meu poble».
   *
   * Aquí no hi ha cap bandera caducada fent-se passar per bandera: hi ha el
   * nom, el municipi i **quan va ser l'últim parte**.
   */
  const registry = data.list
    .slice()
    .sort((a, b) => a.municipality.localeCompare(b.municipality, 'ca')
      || a.name.localeCompare(b.name, 'ca'));

  const townGroups = groupsOf(registry, (b) => (
    b.municipality ? { key: b.municipalityIne5, label: articleFirst(b.municipality) } : null
  ));

  const byCoast = new Map<string, typeof recent>();
  for (const b of recent) {
    const arr = byCoast.get(b.coast) ?? [];
    arr.push(b);
    byCoast.set(b.coast, arr);
  }

  const flagsSorted = [...byFlag].sort((a, b) => b[1] - a[1]);
  const red = recent.filter((b) => flagStyle(b.flag).label === 'Vermella').length;

  /*
   * La resposta, en una frase: com és l'aigua, com és la mar i què diuen les
   * banderes. «1 platges tenen parte» va sortir publicat: el singular es tria.
   */
  const seaLine = coldest && warmest && calmest && roughest ? (() => {
    const a = douglas(calmest.wave!);
    const b = douglas(roughest.wave!);
    return `L’aigua és entre ${num(coldest.sst!, 0)} i ${num(warmest.sst!, 0)} °C i la mar, ${a === b ? a : `${a} a ${b}`}.`;
  })() : null;
  const flagLine = recent.length > 0
    ? `${recent.length === 1 ? 'Una platja té' : `${recent.length} platges tenen`} bandera de les últimes ${FLAG_SHOW_HOURS} hores: ${
      flagsSorted
        .map(([f, n]) => (n === 1 && recent.length === 1
          ? flagStyle(f).label.toLowerCase()
          : `${n} ${n === 1 ? flagStyle(f).label.toLowerCase() : flagStyle(f).plural}`))
        .join(', ')}.`
    : 'Ara cap platja té bandera recent: les posen els socorristes quan són de servei.';

  const pill = (t: number) => ({ background: temperatureColor(t), color: temperatureInk(t) });

  return (
    <article data-wide>
      <PageHero
        crumbs={[{ nom: 'Catalunya', path: '/' }, { nom: 'El mar', path: '/mar' }]}
        eyebrow="Platges i mar"
        icon="tide-high"
        title="Es pot fer un bany?"
        lead={(
          <>
            {seaLine}{seaLine && ' '}{flagLine}
            {jelly.length > 0 && (
              <> {jelly.length === 1 ? 'Una ha' : `${jelly.length} han`} reportat meduses.</>
            )}
          </>
        )}
        stats={[
          warmest && {
            label: 'Aigua més càlida', icon: 'thermometer',
            value: num(warmest.sst!, 1), unit: '°C',
            sub: <>davant {deName(warmest.near)}</>,
          },
          coldest && {
            label: 'Aigua més freda', icon: 'thermometer',
            value: num(coldest.sst!, 1), unit: '°C',
            sub: <>davant {deName(coldest.near)}</>,
          },
          roughest && {
            label: 'Onada més alta', icon: 'tide-high',
            value: num(roughest.wave!, 1), unit: 'm',
            sub: <>{douglas(roughest.wave!)}, davant {deName(roughest.near)}</>,
          },
          red > 0 && {
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
            La bandera la posa el socorrista mirant l&apos;aigua. L&apos;aigua i l&apos;onatge són
            d&apos;un model de mar obert, a uns cinc quilòmetres de la costa.
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
        * seccions. Amb un sol color —115 verdes, que és el normal— `ListFilter`
        * no dibuixa res: el filtre apareix el dia que hi ha alguna cosa a filtrar.
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
                            <span className="row-sub">{articleFirst(b.municipality)}</span>
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

      {/* ── El model, costa per costa i de nord a sud ── */}
      {coasts.size > 0 && (
        <Section id="onatge" title="L'aigua i l'onatge, costa per costa">
          <ul className="card-grid">
            {[...coasts].map(([name, list]) => {
              const ts = list.map((s) => s.sst).filter((v): v is number => v != null);
              const ws = list.map((s) => s.wave).filter((v): v is number => v != null);
              return (
                <li key={name} className="card">
                  <h3 className="card-label mb-1!">{name}</h3>
                  <p className="mb-3 text-[13px] text-[var(--muted)] tnum">
                    {ts.length > 0 && <>aigua {num(Math.min(...ts), 0)}–{num(Math.max(...ts), 0)} °C</>}
                    {ts.length > 0 && ws.length > 0 && ' · '}
                    {ws.length > 0 && <>onades fins a {num(Math.max(...ws), 1)} m</>}
                  </p>
                  <ul className="rows">
                    {list.map((s) => (
                      <li key={s.near}>
                        <span className="row-main">
                          <span className="row-title">{s.near}</span>
                          <span className="row-sub">
                            {[
                              s.wave != null && douglas(s.wave),
                              s.period != null && `${num(s.period, 0)} s`,
                              s.dir != null && `ve ${fromDirection(windCardinal(s.dir))}`,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2.5">
                          {s.wave != null && (
                            <span className="row-value text-[var(--ink-2)]!">{num(s.wave, 1)} m</span>
                          )}
                          {s.sst != null && (
                            <span className="temp-pill" style={pill(s.sst)}>{num(s.sst, 1)}°</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
          <p className="source">
            Model d&apos;onatge i temperatura de l&apos;aigua a uns cinc quilòmetres de la costa
            {sea && sea.points[0] && <>, de {dateTimeLong(sea.points[0].times[sea.index])}</>}.
            Estat de la mar amb l&apos;escala Douglas; el període és el temps entre dues onades.
          </p>
        </Section>
      )}

      <Section id="platges" title={`Les ${registry.length} platges, poble a poble`}>
        <div className="card">
          <ListFilter
            id="fp"
            groups={townGroups}
            legend="Filtra per municipi"
            allLabel="Tots els municipis"
          >
            <ul className="rows rows-cols">
              {registry.map((b) => {
                const shown = b.ageHours <= FLAG_SHOW_HOURS;
                return (
                  <li key={b.code} id={`p-${b.code}`} data-lf={b.municipalityIne5}>
                    <span className="row-main">
                      <span className="row-title">{b.name}</span>
                      <span className="row-sub">{articleFirst(b.municipality)}</span>
                    </span>
                    {shown ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--ink-2)]">
                        <FlagMark flag={b.flag} size={16} />
                        {flagStyle(b.flag).label}
                      </span>
                    ) : (
                      <span className="shrink-0 text-[12px] text-[var(--muted)] tnum" title="Dia de l’últim parte">
                        {dateTiny(b.at)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </ListFilter>
          <p className="source">
            Al costat de cada platja, el dia de l&apos;últim parte; la bandera només hi surt quan és de les últimes {FLAG_SHOW_HOURS} hores. {data.source}.
          </p>
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
