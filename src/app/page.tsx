import Link from 'next/link';
import { CAPITAL_PATHS as CAPITALS, QUICK_PLACES as QUICK, SECTIONS } from '@/lib/nav';
import { allComarques, buildSummary, locationByPath, type Location } from '@/lib/territory';
import { rankings } from '@/lib/rankings';
import {
  activeWarnings, currentFor, forecastFor, groupWarnings, localNowHour, localToday,
} from '@/lib/weather';
import { phenomenonName } from '@/lib/warning-labels';
import { weatherCode } from '@/lib/weather-codes';
import { ago, dateLong, num } from '@/lib/format';
import { SiteSearch } from '@/components/SiteSearch';
import { WeatherIcon } from '@/components/WeatherIcon';
import { TemperatureLegend, TemperatureMap } from '@/components/TemperatureMap';
import { temperatureMap } from '@/lib/map';

/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

/**
 * Les quatre capitals, amb el temps d'ara.
 *
 * És el que mira gairebé tothom que obre un web del temps sense buscar res:
 * com està la seva ciutat o la més propera. Són quatre trossos de predicció
 * —el Barcelonès en fa 77 kB i els altres tres, entre 570 i 770— que es llegeixen
 * al servidor com a molt un cop cada deu minuts: al lector no li arriba res
 * d'això, només les quatre targetes. La llista és `CAPITAL_PATHS`, a `nav.ts`.
 */

async function capitalNow(loc: Location) {
  const [current, forecast] = await Promise.all([currentFor(loc), forecastFor(loc, 48)]);
  const nowIso = localNowHour();
  const hour = forecast?.hourly.find((h) => h.time.slice(0, 13) === nowIso) ?? forecast?.hourly[0] ?? null;
  const today = forecast?.daily[0] ?? null;
  // Com al titular de la fitxa: la màxima d'avui és, com a mínim, la que ja s'ha fet.
  const maxs = [today?.tMax, current?.todayMax].filter((v): v is number => v != null);
  const mins = [today?.tMin, current?.todayMin].filter((v): v is number => v != null);
  return {
    loc,
    temp: current?.temperature ?? hour?.temperature ?? null,
    code: hour?.weatherCode ?? null,
    isDay: hour?.isDay ?? true,
    tMax: maxs.length ? Math.max(...maxs) : null,
    tMin: mins.length ? Math.min(...mins) : null,
  };
}

export default async function Home() {
  const capitals = CAPITALS.map((p) => locationByPath(p)).filter((l): l is Location => l != null);
  const [rank, warnings, map, caps] = await Promise.all([
    rankings(),
    activeWarnings(),
    temperatureMap(),
    Promise.all(capitals.map(capitalNow)),
  ]);
  const quick = QUICK.map((p) => locationByPath(p)).filter((l): l is Location => l != null);
  const comarques = allComarques();
  const summary = buildSummary() as { published: number };
  const groups = groupWarnings(warnings);
  const worst = groups[0];
  const day = dateLong(localToday());

  return (
    <div data-wide className="home">
      <div className="home-top">
        <header className="home-intro">
          <p className="home-date">{day.charAt(0).toUpperCase() + day.slice(1)}</p>
          <h1 className="home-title">El temps a Catalunya</h1>
          <p className="home-lead">
            Predicció i observació per a {summary.published.toLocaleString('ca-ES')} pobles
            i nuclis, cadascun amb la seva altitud i l&apos;estació que el mesura.
          </p>
          {/*
            El cercador, al davant: és el que fa gairebé tothom que arriba a la
            portada. No afegeix JavaScript —el component ja és a la barra de
            totes les pàgines— i sense JavaScript és un formulari.
          */}
          <div className="mt-6">
            <SiteSearch variant="page" />
          </div>
          <ul className="chips mt-4" aria-label="Accessos ràpids">
            {quick.map((l) => (
              <li key={l.path}><Link href={l.path}>{l.nom}</Link></li>
            ))}
          </ul>
        </header>

        {/*
          El mapa de temperatures, el SVG de servidor de 10 kB, sense
          JavaScript. Cada comarca ja és un enllaç: embolicar-lo en un altre en
          faria d'aniuats, que no és HTML vàlid.
        */}
        {map.comarques.some((c) => c.temperature != null) && (
          <section className="card home-map" aria-labelledby="h-mapa">
            <h2 id="h-mapa" className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              Ara a Catalunya
            </h2>
            <TemperatureMap data={map} />
            <TemperatureLegend
              span={map.min != null && map.max != null ? { min: map.min, max: map.max } : undefined}
            />
            <p className="card-foot">
              <Link href="/mapa">Les comarques, de la més càlida a la més freda ›</Link>
            </p>
          </section>
        )}
      </div>

      {caps.length > 0 && (
        <ul className="capitals" aria-label="Les quatre capitals, ara">
          {caps.map((c) => (
            <li key={c.loc.path}>
              <Link href={c.loc.path} className="capital">
                <span className="capital-name">{c.loc.nom}</span>
                <span className="capital-temp tnum">{c.temp != null ? `${Math.round(c.temp)}°` : '—'}</span>
                {c.code != null && <WeatherIcon code={c.code} isDay={c.isDay} size={52} className="capital-icon" />}
                <span className="capital-cond tnum">
                  {[
                    c.code != null && weatherCode(c.code).ca,
                    c.tMax != null && c.tMin != null && `${Math.round(c.tMax)}° / ${Math.round(c.tMin)}°`,
                  ].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        Els avisos, i només quan n'hi ha. Una franja que digui «cap avís» cada
        dia és una franja que ningú no llegeix el dia que en digui un.
      */}
      {worst && (
        <Link href="/avisos" className={`home-warn is-${worst.level}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
          <img
            src={`/icons/w/code-${worst.level === 'vermell' ? 'red' : worst.level === 'taronja' ? 'orange' : 'yellow'}.svg`}
            width={30}
            height={30}
            alt=""
          />
          <span>
            <strong>
              {groups.length} {groups.length === 1 ? 'avís' : 'avisos'} en vigor
            </strong>
            {' '}· el més alt, {worst.level} per {phenomenonName(worst.phenomenon).toLowerCase()}.{' '}
            <u>Vegeu-los tots</u>
          </span>
        </Link>
      )}

      {/*
        ── Els extrems d'ara ─────────────────────────────────────────────────

        Surten de `rankings()`, que ja s'havia baixat l'observació sencera per a
        `/ranquings`: ni una lectura nova ni una unitat de quota. Cada extrem
        porta el seu lloc i és un enllaç, perquè la pregunta següent de qui llegeix
        «el més càlid, 32,1°» és «on».
      */}
      {rank && (
        <section className="mt-10" aria-labelledby="h-extrems">
          <h2 id="h-extrems" className="card-title mb-3">Els extrems d&apos;ara</h2>
          <div className="card">
            <ul className="extremes">
              {([
                ['El més càlid', 'thermometer', rank.stations.nowWarmest[0], (v: number) => `${num(v, 1)}°`],
                ['El més fred', 'thermometer', rank.stations.nowColdest[0], (v: number) => `${num(v, 1)}°`],
                ['Més pluja avui', 'raindrop', rank.stations.rain[0], (v: number) => `${num(v, 1)} mm`],
                /*
                 * La ratxa ja ve en km/h.
                 *
                 * `rankings()` la converteix quan la desa i tornar-la a convertir
                 * aquí la multiplicava per 3,6 una segona vegada: el Monestir de
                 * Montserrat sortia a **180 km/h** una tarda de 37 °C.
                 */
                ['Ratxa ara', 'wind', rank.stations.gust[0], (v: number) => `${v.toFixed(0)} km/h`],
              ] as const).map(([label, icon, row, fmt]) => {
                // Una fila sense estació no s'escriu.
                if (!row) return null;
                const name = row.placeNom ?? row.nom;
                return (
                  <li key={label}>
                    <p className="card-label">
                      {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
                      <img src={`/icons/w/${icon}.svg`} width={20} height={20} alt="" />
                      {label}
                    </p>
                    <p className="extreme-value tnum">{fmt(row.value)}</p>
                    {row.path
                      ? <Link href={row.path} className="extreme-place">{name}</Link>
                      : <span className="extreme-place">{name}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="source">
              {rank.stations.total} estacions del Meteocat
              {rank.ageMin != null && ` · lectura ${ago(rank.ageMin)}`}. La pluja compta des de
              mitjanit; la ratxa és la de l&apos;última lectura.{' '}
              <Link href="/ranquings" className="text-[var(--accent)]">Totes les llistes</Link>.
            </p>
          </div>
        </section>
      )}

      {/*
        ── Tot el lloc ─────────────────────────────────────────────────────────

        La llista surt de `src/lib/nav.ts`, la mateixa que fa servir el peu. Cada
        secció diu en una línia què hi ha, perquè ningú no entra a «Nàutica»
        sense saber què hi trobarà.
      */}
      <section className="mt-12" aria-labelledby="h-explorar">
        <h2 id="h-explorar" className="card-title mb-3">Explorar</h2>
        {/* Les que no porten icona —les estacions, les dades obertes, l'estat—
            són del projecte i no del temps: viuen al peu. */}
        <ul className="explore">
          {SECTIONS.flatMap((g) => g.links).filter((l) => l.icon).map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="explore-link">
                <span className="explore-icon">
                  {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
                  <img src={`/icons/w/${l.icon}.svg`} width={30} height={30} alt="" />
                </span>
                <span className="explore-label">{l.label}</span>
                {l.blurb && <span className="explore-blurb">{l.blurb}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12" aria-labelledby="h-comarques">
        <h2 id="h-comarques" className="card-title mb-3">Les 43 comarques</h2>
        <ul className="chips">
          {comarques.map((c) => (
            <li key={c.codi}><Link href={c.path}>{c.nom}</Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
