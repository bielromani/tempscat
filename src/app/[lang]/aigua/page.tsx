import type { Metadata } from 'next';
import Link from 'next/link';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { dateFull, dateLong, deName, hourSpoken, int, num, signed } from '@/lib/format';
import {
  droughtLevel, droughtSummary, gaugeName, reservoirColor, reservoirName, reservoirs, riverGauges,
  type Reservoir, type RiverGauge,
} from '@/lib/water';
import { fold, match } from '@/lib/search-match';
import { anchorSlug } from '@/lib/zones';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

/**
 * Los embalses, los ríos y la sequía.
 *
 * «Com està el pantà de Sau» es de las preguntas que más se hacen en Catalunya y
 * la respuesta vive hoy en un visor incómodo. Aquí son nueve barras y una cifra.
 *
 * Dos honestidades que van arriba y no en letra pequeña:
 *
 *  · **Solo las conques internes.** El Segre y el Ebro son de la Confederación
 *    Hidrográfica del Ebro. Un lector de Lleida no encontrará su embalse, y es
 *    mejor decírselo que dejar el hueco.
 *  · **El registro de sequía no es un dato en vivo.** Anota cambios de estado, y
 *    el último es de mayo de 2025. Se publica con esa fecha siempre al lado.
 *
 * ## Las fechas van sin preposición delante
 *
 * «Dada del 1 d'octubre» es una falta: delante del 1 y del 11 va «de l'». No
 * hay función en `format.ts` que lo resuelva para fechas, así que las fechas se
 * escriben con el día de la semana delante («de dimarts, 29 de setembre») o
 * detrás de dos puntos.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Els embassaments i els rius de Catalunya',
  description:
    'Com estan els embassaments de les conques internes: percentatge de volum, '
    + 'tendència del mes i cabal dels rius, amb dades de l\'Agència Catalana de l\'Aigua.',
  alternates: { canonical: '/aigua' },
};

/** «Embassament de Sau (Vilanova de Sau)» → «Vilanova de Sau»: el municipi on és. */
function townOf(raw: string): string | null {
  return /\(([^)]+)\)\s*$/.exec(raw)?.[1] ?? null;
}

/** Un embassament: el percentatge en gran, la barra i el que ha fet en 30 dies. */
function ReservoirCard({ r }: { r: Reservoir }) {
  const trend = r.pct != null && r.pct30d != null ? r.pct - r.pct30d : null;
  const town = townOf(r.name);
  return (
    <li id={`e-${r.code}`} className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-semibold leading-tight text-[var(--ink)]">
            {reservoirName(r.name)}
          </h3>
          <p className="mt-0.5 text-[13px] text-[var(--muted)]">
            {[town, r.basin && `conca ${deName(r.basin)}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <p className="tnum shrink-0 text-[28px] font-semibold leading-none tracking-tight text-[var(--ink)]">
          {num(r.pct, 1)}
          <small className="ml-0.5 text-[14px] font-medium text-[var(--muted)]">%</small>
        </p>
      </div>

      {/* La barra es la lectura rápida; la cifra, la exacta. */}
      <div
        className="mt-3 h-2.5 overflow-hidden rounded-full"
        style={{ background: 'var(--line-soft)' }}
        role="img"
        aria-label={`${num(r.pct, 1)} % de volum embassat`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max(1, Math.min(100, r.pct ?? 0))}%`,
            background: reservoirColor(r.pct ?? 0),
          }}
        />
      </div>

      <p className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-0.5 text-[12.5px] text-[var(--muted)]">
        <span>
          <span className="tnum">{num(r.volumeHm3, 1)} hm³</span>
          {r.levelM != null && <> · <span className="tnum">{num(r.levelM, 1)} m</span> sobre el nivell del mar</>}
        </span>
        {trend != null && Math.abs(trend) >= 0.1 && (
          <span
            className="tnum"
            style={{ color: trend < 0 ? 'var(--bad)' : 'var(--good)' }}
            title="Diferència respecte de fa 30 dies"
          >
            {signed(trend, 1)} punts en 30 dies
          </span>
        )}
      </p>
    </li>
  );
}

/** Un aforament: el nom i el cabal. */
function GaugeRow({ r }: { r: RiverGauge }) {
  return (
    <li id={`a-${r.code}`}>
      <span className="row-main">
        <span className="row-title text-[14px]!" title={gaugeName(r.name)}>
          {gaugeName(r.name)}
        </span>
      </span>
      <span className="row-value">
        {num(r.flow, 2)}
        <small className="ml-1 text-[11.5px] font-normal text-[var(--muted)]">m³/s</small>
      </span>
    </li>
  );
}

/** Tres columnes i no quatre: els noms dels aforaments són llargs. */
const GAUGE_ROWS = 'rows rows-cols grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]!';

type Params = Promise<{ q?: string }>;

export default async function AiguaPage({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;
  const res = await reservoirs();
  const rivers = (await riverGauges()).filter((r) => r.flow != null);
  const drought = await droughtSummary();
  const outline = mapOutline();

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Aigua', path: '/aigua' },
  ];

  if (!res?.list.length) {
    return (
      <article>
        <JsonLd data={graph(breadcrumbLd(trail))} />
        <PageHero
          crumbs={trail}
          eyebrow="Embassaments i rius"
          icon="raindrops"
          title="Com estan els embassaments"
          lead="Ara mateix no hi ha dades de l'Agència Catalana de l'Aigua. Torneu-hi en una estona."
        />
      </article>
    );
  }

  const total = res.list.reduce((a, r) => a + (r.volumeHm3 ?? 0), 0);
  const withPct = res.list.filter((r) => r.pct != null);
  // Media ponderada por volumen: la media simple daría el mismo peso a Foix, que
  // tiene 1,8 hm³, que a Susqueda, que tiene 192. Es la cifra que se publica como
  // «les conques internes estan al X %».
  const capacity = withPct.reduce((a, r) => a + (r.volumeHm3 ?? 0) / ((r.pct ?? 1) / 100), 0);
  const overall = capacity > 0 ? (total / capacity) * 100 : null;

  /*
   * La mateixa xifra de fa trenta dies, amb la mateixa ponderació.
   *
   * Només si **tots** els embassaments porten el percentatge de fa un mes: amb
   * un que faltés, la xifra d'ara i la d'abans sortirien de conjunts diferents
   * i la diferència entre les dues no voldria dir res.
   */
  const past = withPct.every((r) => r.pct30d != null) && capacity > 0
    ? (withPct.reduce((a, r) => a + ((r.volumeHm3 ?? 0) / ((r.pct ?? 1) / 100)) * ((r.pct30d ?? 0) / 100), 0)
      / capacity) * 100
    : null;

  const fullest = [...withPct].sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))[0];
  const emptiest = [...withPct].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0];

  const byBasin = new Map<string, typeof rivers>();
  for (const r of rivers) {
    const arr = byBasin.get(r.basin) ?? [];
    arr.push(r);
    byBasin.set(r.basin, arr);
  }

  const basins = [...byBasin]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([basin, list]) => [basin || 'Sense conca', [...list].sort((x, y) => (y.flow ?? 0) - (x.flow ?? 0))] as const);

  // El cercador: un embassament, un riu o el poble d'un aforament.
  const q = (params.q ?? '').trim().slice(0, 60);
  const fq = fold(q);
  const scored = <T,>(list: readonly T[], names: (x: T) => Array<string | null | undefined>) => (fq
    ? list
      .map((x) => ({ x, score: Math.max(0, ...names(x).filter((n): n is string => Boolean(n)).map((n) => match(fq, n))) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((h) => h.x)
    : []);
  const resHits = scored(res.list, (r) => [reservoirName(r.name), townOf(r.name), r.basin]);
  const gaugeHits = scored(rivers, (r) => [gaugeName(r.name), r.basin]);
  const suggestions = [...new Set([
    ...res.list.map((r) => reservoirName(r.name)),
    ...rivers.map((r) => gaugeName(r.name)),
    ...basins.map(([b]) => b),
  ])].sort((x, y) => x.localeCompare(y, 'ca'));

  const abnormal = drought
    ? Object.entries(drought.counts).filter(([state]) => state !== 'NORMALITAT')
    : [];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Embassaments i rius"
        icon="raindrops"
        title="Com estan els embassaments"
        lead={overall != null && (
          <>
            Les conques internes estan al{' '}
            <strong className="tnum">{num(overall, 1)} %</strong>, amb{' '}
            <span className="tnum">{num(total, 1)} hm³</span> embassats.
          </>
        )}
        stats={[
          past != null && overall != null && {
            label: 'Fa 30 dies',
            icon: 'raindrop',
            value: num(past, 1),
            unit: '%',
            sub: `${signed(overall - past, 1)} punts des de llavors`,
          },
          fullest && {
            label: 'El més ple',
            icon: 'raindrops',
            value: num(fullest.pct, 1),
            unit: '%',
            sub: <a href={`#e-${fullest.code}`}>{reservoirName(fullest.name)}</a>,
          },
          emptiest && emptiest !== fullest && {
            label: 'El més buit',
            icon: 'raindrop',
            value: num(emptiest.pct, 1),
            unit: '%',
            sub: <a href={`#e-${emptiest.code}`}>{reservoirName(emptiest.name)}</a>,
          },
        ]}
        note={(
          <>
            {res.at && <>Dades de {dateLong(res.at)}, a {hourSpoken(res.at)}. </>}
            Són els embassaments de les <strong className="font-medium text-[var(--ink-2)]">conques
            internes</strong>, que gestiona l&apos;Agència Catalana de l&apos;Aigua. Els del Segre
            i l&apos;Ebre —Rialb, Oliana, Mequinensa, Riba-roja— són de la Confederació
            Hidrogràfica de l&apos;Ebre i no hi surten.
          </>
        )}
        aside={(
          /*
            On són, abans de la llista.

            Nou embassaments amb el seu percentatge eren nou barres i cap idea de
            geografia: qui no se sap el mapa de memòria no sap si Sau i Susqueda són
            veïns —ho són, al mateix riu— ni per què la Baells i la Llosa del Cavall
            es comporten diferent. Amb el mapa, la llista de sota es llegeix com el
            que és: una conca i no nou dipòsits solts.
          */
          <section className="card" aria-label="Els embassaments al mapa">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/raindrops.svg" width={22} height={22} alt="" />
              On són
            </p>
            <PointsMap
              scale={2}
              outline={outline.features}
              projection={outline.projection}
              width={outline.width}
              height={outline.height}
              labels
              ariaLabel={`Mapa dels ${res.list.length} embassaments de les conques internes, amb el seu percentatge de volum`}
              points={res.list
                .filter((r) => r.pct != null)
                .map((r) => ({
                  key: r.code,
                  lat: r.lat,
                  lon: r.lon,
                  fill: reservoirColor(r.pct as number),
                  ink: (r.pct as number) >= 55 ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)',
                  value: `${Math.round(r.pct as number)}`,
                  label: reservoirName(r.name),
                  tip: `${reservoirName(r.name)}: ${num(r.pct, 1)} % · ${num(r.volumeHm3, 1)} hm³`,
                }))}
              footer={(
                <>
                  El número és el percentatge de volum. El color va de l&apos;ocre sec al
                  blau ple, i és el mateix de les barres de sota.
                </>
              )}
            />
          </section>
        )}
      />

      {/*
        El cercador de la pàgina, sense script, com el de /mar: el formulari
        torna aquí amb `?q=` i el servidor filtra.
      */}
      <form action="/aigua#cerca" method="get" role="search" id="cerca" className="mar-search mt-6">
        <label htmlFor="aigua-q" className="sr-only">Cerca un embassament, un riu o un poble</label>
        <input
          id="aigua-q"
          name="q"
          type="search"
          defaultValue={q}
          list="aigua-llocs"
          placeholder="Cerca un embassament, un riu o un poble"
          autoComplete="off"
        />
        <button type="submit">Cerca</button>
        <datalist id="aigua-llocs">
          {suggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      </form>

      {q && (
        <section className="mb-6" aria-label={`Resultats per ${q}`}>
          <p className="card-label">
            {resHits.length + gaugeHits.length > 0
              ? `${[
                resHits.length > 0 && `${resHits.length} ${resHits.length === 1 ? 'embassament' : 'embassaments'}`,
                gaugeHits.length > 0 && `${gaugeHits.length} ${gaugeHits.length === 1 ? 'aforament' : 'aforaments'}`,
              ].filter(Boolean).join(' i ')} per «${q}»`
              : `Cap embassament ni aforament no es diu «${q}»`}
          </p>
          {resHits.length > 0 && (
            <ul className="card-grid mb-3">
              {resHits.map((r) => <ReservoirCard key={r.code} r={r} />)}
            </ul>
          )}
          {gaugeHits.length > 0 && (
            <div className="card">
              <ul className={GAUGE_ROWS}>
                {gaugeHits.map((r) => <GaugeRow key={r.code} r={r} />)}
              </ul>
            </div>
          )}
          <p className="card-foot"><Link href="/aigua">Tots els embassaments i rius ›</Link></p>
        </section>
      )}

      {/* Les seccions, per saltar-hi. Són àncores: no cal cap script. */}
      <nav aria-label="Seccions" className="mb-2">
        <ul className="chips">
          <li><a href="#embassaments">Embassaments <span>{res.list.length}</span></a></li>
          {drought && <li><a href="#sequera">Sequera</a></li>}
          {basins.map(([basin, list]) => (
            <li key={basin}><a href={`#conca-${anchorSlug(basin)}`}>{basin} <span>{list.length}</span></a></li>
          ))}
        </ul>
      </nav>

      <Section id="embassaments" title={`Els ${res.list.length} embassaments`}>
        <ul className="card-grid">
          {res.list.map((r) => <ReservoirCard key={r.code} r={r} />)}
        </ul>
        <p className="source">
          {res.source}. Percentatge de volum sobre la capacitat de cada embassament; la
          xifra de les conques internes és la mitjana ponderada per la capacitat.
        </p>
      </Section>

      {/* ── Sequía ── */}
      {drought && (
        <Section id="sequera" title="Estat de sequera">
          <div className="card">
            {abnormal.length === 0 ? (
              <p className="text-[var(--ink)]">
                Els {int(Object.keys(drought.byMunicipality).length)} municipis del registre
                estan en <strong className="font-semibold">normalitat</strong>.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {abnormal.map(([state, n]) => {
                  const lv = droughtLevel(state);
                  return (
                    <li key={state} className="flex items-center gap-2">
                      <span
                        className="rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold"
                        style={{ background: lv.color, color: lv.ink }}
                      >
                        {lv.label}
                      </span>
                      <span className="tnum text-[var(--ink-2)]">{n} municipis</span>
                    </li>
                  );
                })}
              </ul>
            )}

            {/*
              La advertencia va aquí y no al pie: sin ella, «normalitat» se lee
              como una lectura de hoy, y es un estado que no cambia hasta que hay
              un decreto nuevo.
            */}
            <p className="source">
              El registre anota <strong className="font-medium text-[var(--ink-2)]">canvis
              d&apos;estat</strong>, no lectures diàries.
              {drought.lastChange && <> Últim canvi: {dateFull(drought.lastChange)}.</>}{' '}
              Que no n&apos;hi hagi vol dir que no s&apos;ha decretat res de nou, però no es
              distingeix d&apos;un registre que hagi deixat d&apos;actualitzar-se. Per a
              restriccions, la font és l&apos;ACA.
            </p>
          </div>
        </Section>
      )}

      {/*
        Els rius, conca per conca i de més cabal a menys.

        Fins al 10 d'octubre de 2026 anaven totes dins d'una sola targeta; ara
        cada conca és una secció amb la seva àncora, com les costes de /mar.
      */}
      {basins.map(([basin, list]) => (
        <section
          key={basin}
          id={`conca-${anchorSlug(basin)}`}
          className="section scroll-mt-4"
          aria-labelledby={`h-${anchorSlug(basin)}`}
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
            <h2 id={`h-${anchorSlug(basin)}`} className="card-title">Conca {deName(basin)}</h2>
            <p className="text-[13px] text-[var(--muted)] tnum">
              {list.length} {list.length === 1 ? 'aforament' : 'aforaments'}
              {list[0]?.flow != null && <> · fins a {num(list[0].flow, 1)} m³/s</>}
            </p>
          </div>
          <div className="card">
            <ul className={GAUGE_ROWS}>
              {list.map((r) => <GaugeRow key={r.code} r={r} />)}
            </ul>
          </div>
        </section>
      ))}

      {rivers.length > 0 && (
        <p className="source mt-6">
          Cabals de {res.source}: lectures de registre, sense validar, i els aforaments es
          veuen afectats per les preses de riu amunt, així que un cabal baix no vol dir
          sempre que plogui poc. Coordenades convertides d&apos;UTM 31N a graus.
        </p>
      )}
    </article>
  );
}
