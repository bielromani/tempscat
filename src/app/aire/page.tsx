import type { Metadata } from 'next';
import Link from 'next/link';
import { articleFirst, dateLong, num } from '@/lib/format';
import { fold, match } from '@/lib/search-match';
import { airStations, stationKind, type AirStation } from '@/lib/air-stations';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { concentrationColor } from '@/lib/scales';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero } from '@/components/PageHero';
import { Fold } from '@/components/Fold';

/**
 * La calidad del aire medida, estación por estación.
 *
 * Es la contrapartida honesta del bloque de CAMS que ya sale en cada ficha: allí
 * un modelo de 11 km dice cómo está el aire **ahora** en todas partes; aquí unos
 * aparatos dicen cómo estuvo **ayer** donde los hay.
 *
 * La página existe en buena medida para poder decir esa diferencia en voz alta.
 * Y para decir la otra que casi nadie explica: **el tipo de estación cambia lo
 * que mide más que la distancia**. Una de tráfico en una calle con cuesta y otra
 * de fondo en un parque, a un kilómetro, dan NO₂ que no se parecen — y las dos
 * están bien.
 *
 * ## «Ayer» no se escribe
 *
 * El día de la serie se escribe con su fecha y no como «ahir»: cuando la XVPCA
 * deja de publicar —pasó el 10 de septiembre de 2026— el último día completo
 * puede ser de hace una semana, y la cabecera diría que es de ayer.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Qualitat de l’aire mesurada a Catalunya',
  description:
    'Les mitjanes diàries de NO₂, ozó i partícules a les estacions de la Xarxa de '
    + 'Vigilància i Previsió de la Contaminació Atmosfèrica.',
  alternates: { canonical: '/aire' },
};

/** Los que se muestran en columna, en el orden en que importan. */
const COLUMNS = [
  { slug: 'no2', label: 'NO₂' },
  { slug: 'o3', label: 'O₃' },
  { slug: 'pm10', label: 'PM10' },
  { slug: 'pm2_5', label: 'PM2,5' },
  { slug: 'so2', label: 'SO₂' },
];

function value(s: AirStation, slug: string): number | null {
  return s.measurements.find((m) => m.slug === slug && m.dailyMean != null)?.dailyMean ?? null;
}

/** L'estació amb el valor més alt —o el més baix— d'un contaminant, i el valor. */
function extreme(list: AirStation[], slug: string, dir: 'max' | 'min') {
  return list
    .map((s) => ({ s, v: value(s, slug) }))
    .filter((x): x is { s: AirStation; v: number } => x.v != null)
    .sort((a, b) => (dir === 'max' ? b.v - a.v : a.v - b.v))[0] ?? null;
}

/** Les zones, per agrupar les estacions per on són. Una comarca que no hi sigui va a «Altres». */
const ZONES: Array<[string, string[]]> = [
  ['Barcelona i rodalia', ['Barcelonès', 'Baix Llobregat', 'Vallès Occidental', 'Vallès Oriental', 'Maresme']],
  ['Catalunya central i Penedès', ['Bages', 'Osona', 'Anoia', 'Berguedà', 'Alt Penedès', 'Garraf']],
  ['Comarques de Girona', ['Gironès', 'Alt Empordà', 'Baix Empordà', 'Garrotxa', 'Ripollès', 'Selva']],
  ['Camp de Tarragona', ['Tarragonès', 'Baix Camp', 'Alt Camp', 'Priorat']],
  ['Terres de l’Ebre', ['Baix Ebre', 'Montsià', 'Terra Alta', "Ribera d'Ebre"]],
  ['Ponent i Pirineu', ['Segrià', 'Garrigues', 'Noguera', 'Cerdanya', 'Pallars Jussà', 'Pallars Sobirà']],
];

const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Params = Promise<{ q?: string }>;

export default async function AirePage({ searchParams }: { searchParams: Params }) {
  const [data, params] = await Promise.all([airStations(), searchParams]);

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Aire mesurat', path: '/aire' },
  ];

  if (!data?.list.length) {
    return (
      <article>
        <JsonLd data={graph(breadcrumbLd(trail))} />
        <PageHero
          crumbs={trail}
          eyebrow="Qualitat de l'aire"
          icon="haze"
          title="L'aire, mesurat"
          lead="Ara mateix no hi ha mesures de la XVPCA. Torneu-hi en una estona."
        />
      </article>
    );
  }

  const rows = [...data.list].sort((a, b) => (value(b, 'no2') ?? -1) - (value(a, 'no2') ?? -1));

  const zoneOf = (st: AirStation) => ZONES.find(([, cs]) => cs.includes(st.comarca))?.[0] ?? 'Altres';
  const zones: Array<[string, AirStation[]]> = [...ZONES.map(([z]) => z), 'Altres']
    .map((z) => [z, rows.filter((st) => zoneOf(st) === z)] as [string, AirStation[]])
    .filter(([, list]) => list.length > 0);

  // El cercador: pel nom de l'estació o pel poble on és.
  const q = (params.q ?? '').trim().slice(0, 60);
  const fq = fold(q);
  const hits = fq
    ? rows
      .map((st) => ({ st, score: Math.max(match(fq, st.name), match(fq, articleFirst(st.municipality))) }))
      .filter((h) => h.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((h) => h.st)
    : [];
  const suggestions = [...new Set(rows.flatMap((st) => [st.name, articleFirst(st.municipality)]))]
    .sort((x, y) => x.localeCompare(y, 'ca'));

  const outline = mapOutline();
  /*
   * Les estacions amb NO₂ i el pitjor valor del dia, que és el que dóna
   * l'escala. Es calcula un cop: dins del `map` es tornaria a recalcular a
   * cada punt, i el dia que una acabi tenint un valor diferent del que ha
   * fixat l'escala, el mapa sortiria amb un color que no vol dir res.
   */
  const mapped = data.list
    .map((st) => ({ s: st, v: value(st, 'no2') }))
    .filter((x): x is { s: typeof x.s; v: number } => x.v != null);
  const worstNo2 = mapped.reduce((a, x) => Math.max(a, x.v), 0);

  const no2Max = extreme(data.list, 'no2', 'max');
  const no2Min = extreme(data.list, 'no2', 'min');
  const pm10Max = extreme(data.list, 'pm10', 'max');

  const stat = (label: string, x: { s: AirStation; v: number } | null, sub?: string) => x && {
    label,
    value: num(x.v, 1),
    unit: 'µg/m³',
    sub: sub ? `${x.s.name} · ${sub}` : x.s.name,
  };

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Qualitat de l'aire"
        icon="haze"
        title="L'aire, mesurat"
        lead={(
          <>
            Mitjanes de tot el dia a {rows.length} estacions de la XVPCA,{' '}
            {data.day ? <>de <strong>{dateLong(data.day)}</strong></> : 'del darrer dia complet'}.{' '}
            No és l&apos;aire d&apos;ara: el registre porta unes vint hores de retard.
          </>
        )}
        stats={[
          stat('NO₂ més alt', no2Max),
          stat('NO₂ més baix', no2Min),
          stat('PM10 més alt', pm10Max),
        ]}
        note={(
          <>
            El registre s&apos;actualitza un cop al dia de matinada. L&apos;índex de cada
            fitxa és d&apos;un model, cobreix tot el territori i sí que va al dia: són dues
            coses útils i diferents.
          </>
        )}
        aside={mapped.length > 0 && (
          /*
            On són les estacions i quant hi van mesurar.

            La pàgina era una taula de 76 files ordenada per NO₂, i una taula no
            diu que el diòxid de nitrogen és una cosa de trànsit i que per tant es
            concentra a l'àrea de Barcelona. El mapa ho diu sense una frase.

            El color és **relatiu al pitjor del dia** i no una banda oficial: les
            bandes europees són d'un índex horari i això és una mitjana diària. El
            peu ho diu, perquè un mapa amb els colors de l'índex i uns valors que
            no són els que l'índex classifica seria una etiqueta manllevada.
          */
          <section className="card" aria-label="El diòxid de nitrogen mesurat, al mapa">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/haze.svg" width={22} height={22} alt="" />
              Diòxid de nitrogen
            </p>
            <PointsMap
              scale={2}
              outline={outline.features}
              projection={outline.projection}
              width={outline.width}
              height={outline.height}
              ariaLabel={`Mapa de Catalunya amb el diòxid de nitrogen mesurat a ${mapped.length} estacions`}
              points={mapped.map((m) => ({
                key: m.s.code,
                lat: m.s.lat,
                lon: m.s.lon,
                r: 6,
                fill: concentrationColor(m.v, worstNo2),
                tip: `${m.s.name}: ${num(m.v, 1)} µg/m³ de NO₂`,
              }))}
              footer={(
                <>
                  Cada punt és una estació, de clar a fosc fins al pitjor valor del dia.
                  És una mitjana diària i no una qualificació: les bandes oficials són
                  d&apos;un índex horari. El NO₂ ve del trànsit, i s&apos;acumula on n&apos;hi ha.
                </>
              )}
            />
          </section>
        )}
      />

      {/*
        El cercador de la pàgina: el poble o l'estació. Sense script, com el de
        /mar: el formulari torna aquí amb `?q=` i el servidor filtra.
      */}
      <form action="/aire#cerca" method="get" role="search" id="cerca" className="mar-search mt-6">
        <label htmlFor="aire-q" className="sr-only">Cerca un poble o una estació</label>
        <input
          id="aire-q"
          name="q"
          type="search"
          defaultValue={q}
          list="aire-llocs"
          placeholder="Cerca un poble o una estació"
          autoComplete="off"
        />
        <button type="submit">Cerca</button>
        <datalist id="aire-llocs">
          {suggestions.map((n) => <option key={n} value={n} />)}
        </datalist>
      </form>

      {q && (
        <section className="mb-6" aria-label={`Resultats per ${q}`}>
          <p className="card-label">
            {hits.length > 0
              ? `${hits.length === 1 ? 'Una estació' : `${hits.length} estacions`} per «${q}»`
              : `Cap estació no es diu «${q}» ni és en un poble que es digui així`}
          </p>
          {hits.length > 0 && (
            <ul className="card-grid">
              {hits.map((s) => <StationCard key={s.code} s={s} />)}
            </ul>
          )}
          <p className="card-foot"><Link href="/aire">Totes les estacions ›</Link></p>
        </section>
      )}

      {/* Les zones, per saltar-hi. Són àncores: no cal cap script. */}
      <nav aria-label="Zones" className="mb-2">
        <ul className="chips">
          {zones.map(([name]) => (
            <li key={name}><a href={`#zona-${slug(name)}`}>{name}</a></li>
          ))}
        </ul>
      </nav>

      {/*
        Les estacions, zona per zona i de la que en té més a la que menys.

        Fins al 9 d'octubre de 2026 era una taula de 73 files i set columnes
        ordenada per NO₂ que al mòbil calia arrossegar de costat. Ara, com a
        /mar: una targeta per estació, agrupades per on són.
      */}
      {zones.map(([name, list]) => {
        const no2 = list.map((s) => value(s, 'no2')).filter((v): v is number => v != null);
        return (
          <section key={name} id={`zona-${slug(name)}`} className="section scroll-mt-4" aria-labelledby={`h-${slug(name)}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`h-${slug(name)}`} className="card-title">{name}</h2>
              <p className="text-[13px] text-[var(--muted)] tnum">
                {list.length} {list.length === 1 ? 'estació' : 'estacions'}
                {no2.length > 0 && <> · NO₂ de {num(Math.min(...no2), 0)} a {num(Math.max(...no2), 0)} µg/m³</>}
              </p>
            </div>
            <ul className="card-grid">
              {list.map((s) => <StationCard key={s.code} s={s} />)}
            </ul>
          </section>
        );
      })}

      <p className="source mt-6">
        {data.source}. Mitjanes de les 24 hores, en µg/m³, i només amb el dia sencer: una
        mitjana de mitja jornada no és una mitjana diària. Un guió vol dir que l&apos;estació
        no mesura aquell contaminant, no un zero.
      </p>

      <div className="mt-10">
        <Fold title="Com es llegeix" summary="El tipus d'estació i l'ozó">
          <div className="card prose">
            <p>
              <strong>El tipus d&apos;estació canvia el que mesura més que la
              distància.</strong> Una de trànsit al costat d&apos;una via amb pendent i una de
              fons en un parc, a un quilòmetre l&apos;una de l&apos;altra, donen NO₂ que no
              s&apos;assemblen, i les dues estan bé. La columna de la dreta diu de quina mena
              és cadascuna.
            </p>
            <p>
              <strong>L&apos;ozó fa el camí contrari que el trànsit:</strong> puja on hi ha
              menys cotxes i més sol, perquè els òxids de nitrogen el destrueixen. Un ozó alt
              en una estació rural i baix a la ciutat és el comportament normal.
            </p>
          </div>
        </Fold>
      </div>
    </article>
  );
}

/**
 * Una estació: on és, de quina mena, i els tres contaminants que més es
 * miren. Els altres dos, quan en mesura, en una línia a sota.
 */
function StationCard({ s }: { s: AirStation }) {
  const town = articleFirst(s.municipality);
  const extra = [
    value(s, 'pm2_5') != null && `PM2,5 ${num(value(s, 'pm2_5'), 1)}`,
    value(s, 'so2') != null && `SO₂ ${num(value(s, 'so2'), 1)}`,
  ].filter(Boolean);
  return (
    <li className="card tram">
      <h3 className="tram-name">
        {s.name}
        <span className="block text-[12.5px] font-normal text-[var(--muted)]">
          {fold(s.name).startsWith(fold(town)) ? '' : `${town} · `}{stationKind(s)}
        </span>
      </h3>
      <dl className="tram-now">
        {(['no2', 'pm10', 'o3'] as const).map((slug) => {
          const v = value(s, slug);
          return (
            <div key={slug}>
              <dt>{COLUMNS.find((c) => c.slug === slug)!.label}</dt>
              <dd>{v != null ? num(v, 1) : <span className="text-[var(--muted)]">—</span>}</dd>
            </div>
          );
        })}
      </dl>
      {extra.length > 0 && <p className="tram-src">{extra.join(' · ')} · en µg/m³</p>}
    </li>
  );
}
