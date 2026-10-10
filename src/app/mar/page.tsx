import type { Metadata } from 'next';
import Link from 'next/link';
import { windCardinal } from '@/lib/variables';
import { articleFirst, dateShort, dayTiny, deWord, fromDirection, num } from '@/lib/format';
import { fold, match, matchWithContext } from '@/lib/search-match';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { douglas, flagStyle, parseJellyfish, FLAG_SHOW_HOURS } from '@/lib/sea';
import { nauticalConditions, type SeaStretch } from '@/lib/activities';
import { buildTrams, slug, tramName, type Tram } from '@/lib/coast';
import { activeWarnings } from '@/lib/weather';
import { allComarques, municipisOfComarca } from '@/lib/territory';
import { FlagMark, JellyfishMark } from '@/components/SeaMarks';
import { CoastMap, type CoastPoint } from '@/components/CoastMap';
import { mapOutline } from '@/lib/map';
import { PageHero } from '@/components/PageHero';
import { CoastalWarning } from '@/components/CoastalWarning';
import { Fold } from '@/components/Fold';

/**
 * El mar: com està cada tros de costa, i les platges que hi ha.
 *
 * ## La unitat és el tram, no la platja
 *
 * El model de mar té **vint punts** de Portbou a Alcanar, a uns cinc
 * quilòmetres de la costa. Posar-li una temperatura de l'aigua a cadascuna de
 * les 230 platges seria fer veure que en sabem 230 quan en sabem vint: totes
 * les platges d'un tram tindrien la mateixa xifra repetida, cada una amb
 * l'aparença d'una mesura pròpia. Així que la pàgina es llegeix per **trams**
 * —cada punt del model, amb les platges que té més a prop— i a cada tram hi ha
 * junt tot el que hi ha: l'aigua i l'onada del model, el vent que mesura
 * l'estació de la vora, els tres dies següents, i les platges amb la bandera
 * quan el socorrista n'ha posat una fa poc.
 *
 * Fins al 9 d'octubre de 2026 la mateixa informació anava en tres blocs
 * separats —les banderes, una taula de l'onatge i un registre de platges— i
 * calia creuar-los a mà.
 *
 * ## La bandera, quan hi és
 *
 * La posa un socorrista de servei. Fora de temporada no n'hi ha cap de
 * recent, i la pàgina ho diu una vegada a dalt en comptes d'ensenyar 230
 * banderes velles. Cada platja segueix tenint el seu `id` (`p-<codi>`) perquè
 * el cercador hi porta.
 *
 * ## Què s'ha deixat fora, i per què
 *
 * Les marees —a la costa catalana són d'uns vint centímetres i no decideixen
 * res—, les hores del servei de socorrisme —no hi ha cap font que les
 * publiqui— i les càmeres de platja —cap no té una llicència que ens deixi
 * tornar-les a servir—. L'índex UV és a la fitxa de cada municipi, amb la
 * predicció del seu punt.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Platges i estat del mar a Catalunya',
  description:
    'La temperatura de l’aigua, l’onatge, el vent i la bandera de les platges, '
    + 'tram a tram de Portbou a Alcanar, i la previsió del mar dels pròxims dies.',
  alternates: { canonical: '/mar' },
};

/** El poble sol, perquè «calella» trobi les platges de Calella i no només les que en porten el nom. */
function match2(fq: string, town: string): number {
  return Math.round(match(fq, town) * 0.9);
}


type Params = Promise<{ q?: string }>;

export default async function MarPage({ searchParams }: { searchParams: Params }) {
  const [data, warnings, params] = await Promise.all([nauticalConditions(), activeWarnings(), searchParams]);
  const stretches = data?.stretches ?? [];

  if (!data || !stretches.length) {
    return (
      <article>
        <PageHero
          crumbs={[{ nom: 'Catalunya', path: '/' }, { nom: 'El mar', path: '/mar' }]}
          eyebrow="Platges i mar"
          icon="tide-high"
          title="Com està el mar"
          lead="Encara no hi ha dades del mar."
        />
      </article>
    );
  }

  const trams = buildTrams(stretches, data.beaches);

  const coasts: Array<[string, Tram[]]> = [];
  for (const t of trams) {
    const last = coasts.at(-1);
    if (last && last[0] === t.coast) last[1].push(t);
    else coasts.push([t.coast, [t]]);
  }

  // La fitxa de cada municipi, per enllaçar-hi des de la platja.
  const townPath = new Map<string, string>();
  for (const c of allComarques()) {
    for (const m of municipisOfComarca(c.codi)) {
      if (m.municipiIne5) townPath.set(m.municipiIne5, m.path);
    }
  }

  // ── El resum de dalt ─────────────────────────────────────────────────────
  const withSst = stretches.filter((s) => s.sst != null);
  const withWave = stretches.filter((s) => s.waveHeight != null);
  const sstMin = withSst.length ? Math.min(...withSst.map((s) => s.sst!)) : null;
  const sstMax = withSst.length ? Math.max(...withSst.map((s) => s.sst!)) : null;
  const roughest = withWave.reduce<SeaStretch | null>((a, s) => (!a || s.waveHeight! > a.waveHeight! ? s : a), null);
  const calmest = withWave.reduce<SeaStretch | null>((a, s) => (!a || s.waveHeight! < a.waveHeight! ? s : a), null);
  const tramOf = (s: SeaStretch | null) => trams.find((t) => t.stretch === s) ?? null;

  const fresh = data.beaches.filter((b) => b.ageHours <= FLAG_SHOW_HOURS);
  const red = fresh.filter((b) => b.flag === 'vermella').length;
  const lastReport = data.beaches.reduce<string | null>((a, b) => (!a || b.at > a ? b.at : a), null);

  const seaWords = calmest && roughest
    ? (douglas(calmest.waveHeight!) === douglas(roughest.waveHeight!)
      ? douglas(roughest.waveHeight!)
      : `${deWord(douglas(calmest.waveHeight!))} a ${douglas(roughest.waveHeight!)}`)
    : null;

  const geo = mapOutline();
  // Un punt per punt del model, encara que en surtin dues targetes.
  const coastPoints: CoastPoint[] = trams.filter((t, i) => trams.findIndex((o) => o.stretch === t.stretch) === i).map((t) => {
    const flagged = t.beaches.find((b) => b.ageHours <= FLAG_SHOW_HOURS);
    return {
      id: t.stretch.near,
      lat: t.stretch.lat,
      lon: t.stretch.lon,
      near: tramName(t.towns),
      sst: t.stretch.sst,
      wave: t.stretch.waveHeight,
      flag: flagged?.flag ?? null,
      beachCode: flagged?.code ?? t.beaches[0]?.code ?? null,
    };
  });

  // ── El cercador de la pàgina ─────────────────────────────────────────────
  /*
   * Només platges i pobles de costa, i sense JavaScript: el formulari torna a
   * aquesta mateixa pàgina amb `?q=`, i el servidor ensenya les que hi casen,
   * cada una amb les xifres del seu tram i un enllaç a la targeta. Els
   * suggeriments mentre s'escriu els dona el navegador amb un `<datalist>`.
   */
  const q = (params.q ?? '').trim().slice(0, 60);
  const fq = fold(q);
  const hits = fq
    ? trams
      .flatMap((t) => t.beaches.map((b) => ({
        t, b, score: Math.max(matchWithContext(fq, b.name), match2(fq, articleFirst(b.municipality))),
      })))
      .filter((h) => h.score > 0)
      .sort((x, y) => y.score - x.score || y.b.lat - x.b.lat)
      .slice(0, 40)
    : [];
  const suggestions = [...new Set([
    ...data.beaches.map((b) => articleFirst(b.municipality)),
    ...data.beaches.map((b) => b.name),
  ])].sort((x, y) => x.localeCompare(y, 'ca'));

  const pill = (t: number) => ({ background: temperatureColor(t), color: temperatureInk(t) });
  const windAge = stretches.find((s) => s.wind)?.wind?.ageMin ?? null;

  return (
    <article data-wide>
      <PageHero
        crumbs={[{ nom: 'Catalunya', path: '/' }, { nom: 'El mar', path: '/mar' }]}
        eyebrow="Platges i mar"
        icon="tide-high"
        title="Com està el mar"
        lead={(
          <>
            {sstMin != null && sstMax != null && (
              <>L’aigua és entre {num(sstMin, 0)} i {num(sstMax, 0)} °C</>
            )}
            {seaWords && <> i la mar, {seaWords}</>}.
            {' '}
            {fresh.length > 0
              ? `${fresh.length === 1 ? 'Una platja té' : `${fresh.length} platges tenen`} bandera de les últimes ${FLAG_SHOW_HOURS} hores.`
              : 'Ara cap platja té bandera: només en posen els socorristes quan són de servei.'}
          </>
        )}
        stats={[
          sstMin != null && sstMax != null && {
            label: 'Aigua', icon: 'thermometer',
            value: `${num(sstMin, 0)}–${num(sstMax, 0)}`, unit: '°C',
            sub: withSst.length > 1
              ? <>la més càlida, a {tramName(tramOf(withSst.reduce((a, s) => (s.sst! > a.sst! ? s : a)))?.towns ?? [])}</>
              : null,
          },
          roughest && {
            label: 'Onada més alta', icon: 'tide-high',
            value: num(roughest.waveHeight!, 1), unit: 'm',
            sub: <>{douglas(roughest.waveHeight!)}, a {tramName(tramOf(roughest)?.towns ?? [])}</>,
          },
          fresh.length > 0 && {
            label: 'Banderes', icon: red > 0 ? 'code-red' : undefined,
            value: String(fresh.length),
            sub: red > 0
              ? `${red === 1 ? 'una vermella' : `${red} vermelles`}: no us hi banyeu`
              : 'cap de vermella',
          },
        ]}
        note={fresh.length === 0 && lastReport ? (
          <>L’últim parte d’un socorrista és del {dateShort(lastReport)}.</>
        ) : undefined}
        aside={(
          <section className="card" aria-label="La costa, ara">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/tide-high.svg" width={22} height={22} alt="" />
              L’aigua, tram a tram
            </p>
            <CoastMap
              outline={geo.features}
              projection={geo.projection}
              width={geo.width}
              height={geo.height}
              points={coastPoints}
            />
          </section>
        )}
      />

      {/* Els avisos de mar, abans que res: és el que diu si avui s'hi pot anar. */}
      <CoastalWarning warnings={warnings} />

      <form action="/mar#cerca" method="get" role="search" id="cerca" className="mar-search">
        <label htmlFor="mar-q" className="sr-only">Cerca una platja o un poble de costa</label>
        <input
          id="mar-q"
          name="q"
          type="search"
          defaultValue={q}
          list="mar-llocs"
          placeholder="Cerca una platja o un poble de costa"
          autoComplete="off"
        />
        <button type="submit">Cerca</button>
        <datalist id="mar-llocs">
          {suggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      </form>

      {q && (
        <section className="card mb-6" aria-label={`Resultats per ${q}`}>
          <p className="card-label">
            {hits.length > 0
              ? `${hits.length === 40 ? 'Les primeres 40' : hits.length === 1 ? 'Una platja' : `${hits.length} platges`} per «${q}»`
              : `Cap platja ni poble de costa no es diu «${q}»`}
          </p>
          {hits.length > 0 && (
            <ul className="rows">
              {hits.map(({ t, b }) => {
                const shown = b.ageHours <= FLAG_SHOW_HOURS;
                return (
                  <li key={b.code}>
                    <a href={`#${t.id}`} className="row-main">
                      <span className="row-title">{b.name}</span>
                      <span className="row-sub">
                        {articleFirst(b.municipality)}
                        {t.stretch.waveHeight != null && <> · onada {num(t.stretch.waveHeight, 1)} m, {douglas(t.stretch.waveHeight)}</>}
                      </span>
                    </a>
                    <span className="flex shrink-0 items-center gap-2">
                      {shown && <FlagMark flag={b.flag} size={18} />}
                      {t.stretch.sst != null && (
                        <span className="temp-pill" style={pill(t.stretch.sst)}>{num(t.stretch.sst, 1)}°</span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="card-foot"><Link href="/mar">Totes les platges ›</Link></p>
        </section>
      )}

      {/* Les costes, per saltar-hi. Són àncores: no cal cap script. */}
      <nav aria-label="Costes" className="mb-2">
        <ul className="chips">
          {coasts.map(([name]) => (
            <li key={name}><a href={`#costa-${slug(name)}`}>{name}</a></li>
          ))}
        </ul>
      </nav>

      {coasts.map(([name, list]) => {
        const ts = list.map((t) => t.stretch.sst).filter((v): v is number => v != null);
        const ws = list.map((t) => t.stretch.waveHeight).filter((v): v is number => v != null);
        return (
          <section
            key={name}
            id={`costa-${slug(name)}`}
            className="section scroll-mt-4"
            aria-labelledby={`h-${name}`}
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`h-${name}`} className="card-title">{name}</h2>
              <p className="text-[13px] text-[var(--muted)] tnum">
                {ts.length > 0 && <>aigua {num(Math.min(...ts), 0)}–{num(Math.max(...ts), 0)} °C</>}
                {ws.length > 0 && <> · onades fins a {num(Math.max(...ws), 1)} m</>}
              </p>
            </div>
            <ul className="card-grid">
              {list.map((t) => <TramCard key={t.id} tram={t} townPath={townPath} pill={pill} />)}
            </ul>
          </section>
        );
      })}

      <p className="source mt-6">
        L’aigua i l’onatge, d’un model de mar obert a uns cinc quilòmetres de la costa. El vent,
        mesurat a l’estació del Meteocat més propera{windAge != null && <>, fa {windAge} min</>}.
        Les banderes les posen els socorristes, i només surten si són de les últimes {FLAG_SHOW_HOURS} hores. {data.source}.
      </p>

      <div className="section">
        <Fold
          id="que-vol-dir"
          title="Què vol dir cada dada, i què no"
          summary="L'onatge és de mar obert, la bandera caduca i les meduses porten el nom científic"
        >
          <div className="card prose">
            <p>
              <strong>L&apos;onatge del model és de mar obert</strong>, a uns cinc quilòmetres de la
              costa. No recull el que passa dins d&apos;una cala ni els corrents de ressaca, que són
              la causa principal dels ofegaments: mig metre d&apos;onada pot ser una platja tranquil·la
              o una on no s&apos;hi ha d&apos;entrar, segons el fons. L&apos;estat de la mar fa servir
              l&apos;escala Douglas: arrissada, marejol, maror…
            </p>
            <p>
              <strong>Una bandera caduca.</strong> La posa un socorrista quan és de servei, i fora
              d&apos;horari no s&apos;actualitza. Per això cada una porta l&apos;hora del seu parte,
              i les de més de {FLAG_SHOW_HOURS} hores no surten.
            </p>
            <p>
              <strong>Les meduses</strong> les reporten els socorristes amb el nom científic. Al
              costat hi va el nom corrent i què se&apos;n sap de la picada; una espècie que no
              consti a la taula s&apos;ha de tractar com si piqués.
            </p>
          </div>
        </Fold>
      </div>
    </article>
  );
}

/**
 * Un tram de costa: tot el que se'n sap, junt.
 *
 * Quatre xifres a dalt —aigua, onada, vent i la tendència— i a sota les
 * platges, que porten la bandera al costat quan n'hi ha una de recent.
 */
function TramCard({
  tram, townPath, pill,
}: {
  tram: Tram;
  townPath: Map<string, string>;
  pill: (t: number) => React.CSSProperties;
}) {
  const s = tram.stretch;
  const w = s.wind;
  return (
    <li className="card tram scroll-mt-4" id={tram.id}>
      <h3 className="tram-name">{tramName(tram.towns)}</h3>

      <dl className="tram-now">
        <div>
          <dt>Aigua</dt>
          <dd>
            {s.sst != null
              ? <span className="temp-pill" style={pill(s.sst)}>{num(s.sst, 1)}°</span>
              : '—'}
          </dd>
        </div>
        <div>
          <dt>Onada</dt>
          <dd>
            {s.waveHeight != null ? <>{num(s.waveHeight, 1)} m</> : '—'}
            {s.waveHeight != null && <small>{douglas(s.waveHeight)}</small>}
          </dd>
        </div>
        <div>
          <dt>Vent</dt>
          <dd>
            {w?.kmh != null ? <>{w.kmh} km/h</> : '—'}
            {w?.direction != null && w.kmh != null && w.kmh > 0 && (
              <small>{fromDirection(windCardinal(w.direction))}</small>
            )}
          </dd>
        </div>
      </dl>

      {s.days.length > 1 && (
        <div>
        <p className="tram-days-label">Els pròxims dies · onada més alta i aigua</p>
        <ol className="tram-days" aria-label="Els pròxims dies">
          {s.days.map((d, i) => (
            <li key={d.date}>
              <span>{i === 0 ? 'avui' : dayTiny(`${d.date}T12:00`)}</span>
              <span className="tnum">{d.waveMax != null ? `${num(d.waveMax, 1)} m` : '—'}</span>
              <span className="tnum text-[var(--muted)]">{d.sst != null ? `${num(d.sst, 0)}°` : ''}</span>
            </li>
          ))}
        </ol>
        </div>
      )}

      {/*
        Les platges, poble a poble: el nom del tram diu d'on a on va, i aquí hi
        ha tots els pobles. Cada platja porta el seu `id` perquè el cercador del
        web hi porta.
      */}
      {tram.beaches.length > 0 && (
        <ul className="tram-towns" aria-label="Platges">
          {tram.towns.map((town) => {
            const list = tram.beaches.filter((b) => articleFirst(b.municipality) === town);
            const href = townPath.get(list[0].municipalityIne5);
            return (
              <li key={town}>
                {href ? <Link href={href} className="tram-town">{town}</Link> : <span className="tram-town">{town}</span>}
                <span className="tram-beaches">
                  {list.map((b) => {
                    const shown = b.ageHours <= FLAG_SHOW_HOURS;
                    const jellies = shown ? parseJellyfish(b.jellyfish) : [];
                    return (
                      <span
                        key={b.code}
                        id={`p-${b.code}`}
                        title={shown ? `Bandera ${flagStyle(b.flag).label.toLowerCase()}` : undefined}
                      >
                        {shown && <FlagMark flag={b.flag} size={14} />}
                        {b.name}
                        {jellies.length > 0 && (
                          <span className="ml-1">
                            {jellies.map((j) => <JellyfishMark key={j.species} species={j.species} amount={j.amount} />)}
                          </span>
                        )}
                      </span>
                    );
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {w?.kmh != null && (
        <p className="tram-src">vent mesurat a {w.station}, a {w.distKm} km</p>
      )}
    </li>
  );
}
