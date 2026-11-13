import Link from 'next/link';
import { CAPITAL_PATHS as CAPITALS, sections } from '@/lib/nav';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';
import { allComarques, buildSummary, locationByPath, type Location } from '@/lib/territory';
import { rankings } from '@/lib/rankings';
import {
  activeWarnings, currentFor, forecastFor, groupWarnings, localNowHour, localToday,
} from '@/lib/weather';
import { phenomenonName } from '@/lib/warning-labels';
import { codeLabel, weatherCode } from '@/lib/weather-codes';
import { ago, dateLong, int, num, placeName } from '@/lib/format';
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
  const today = forecast?.daily.find((d) => d.date === localToday()) ?? null;
  // La mateixa xifra que el titular de la fitxa: la lectura corregida per
  // l'altitud del lloc, no la de l'estació a seques. Barcelona es mesura al
  // Raval i Girona a 30 m per sota, i la targeta i la fitxa deien números
  // diferents de la mateixa ciutat.
  const temp = current?.temperatureAdjusted ?? hour?.temperature ?? null;
  // I com al titular: la màxima d'avui és, com a mínim, la que ja s'ha fet.
  const observed = current?.aggregatesDay === localToday() ? current : null;
  const maxs = [today?.tMax, observed?.todayMax, observed && temp].filter((v): v is number => typeof v === 'number');
  const mins = [today?.tMin, observed?.todayMin, observed && temp].filter((v): v is number => typeof v === 'number');
  return {
    loc,
    temp,
    code: hour?.weatherCode ?? null,
    isDay: hour?.isDay ?? true,
    tMax: maxs.length ? Math.max(...maxs) : null,
    tMin: mins.length ? Math.min(...mins) : null,
  };
}

/** El nivell de l'avís en castellà; en català el codi ja és la paraula. */
const NIVEL: Record<string, string> = { verd: 'verde', groc: 'amarillo', taronja: 'naranja', vermell: 'rojo' };

export default async function Home() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const es = lang === 'es';
  const capitals = CAPITALS.map((p) => locationByPath(p)).filter((l): l is Location => l != null);
  const [rank, warnings, map, caps] = await Promise.all([
    rankings(),
    activeWarnings(),
    temperatureMap(),
    Promise.all(capitals.map(capitalNow)),
  ]);
  const comarques = allComarques();
  const summary = buildSummary() as { published: number };
  const groups = groupWarnings(warnings);
  const worst = groups[0];
  const day = dateLong(localToday(), lang);

  return (
    <div data-wide className="home">
      <div className="home-top">
        <header className="home-intro">
          <p className="home-date">{day.charAt(0).toUpperCase() + day.slice(1)}</p>
          <h1 className="home-title">{t('El temps a Catalunya', 'El tiempo en Cataluña')}</h1>
          {es ? (
            <p className="home-lead">
              Predicción y observación para {int(summary.published)} pueblos
              y núcleos, cada uno con su altitud y la estación que lo mide.
            </p>
          ) : (
            <p className="home-lead">
              Predicció i observació per a {int(summary.published)} pobles
              i nuclis, cadascun amb la seva altitud i l&apos;estació que el mesura.
            </p>
          )}
          {/*
            El cercador, al davant: és el que fa gairebé tothom que arriba a la
            portada. No afegeix JavaScript —el component ja és a la barra de
            totes les pàgines— i sense JavaScript és un formulari.
          */}
          <div className="mt-6">
            <SiteSearch lang={lang} variant="page" />
          </div>
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
              {t('Ara a Catalunya', 'Ahora en Cataluña')}
            </h2>
            <TemperatureMap data={map} lang={lang} />
            <TemperatureLegend
              span={map.min != null && map.max != null ? { min: map.min, max: map.max } : undefined}
              lang={lang}
            />
            <p className="card-foot">
              <Link href="/mapa">{t('Les comarques, de la més càlida a la més freda ›', 'Las comarcas, de la más cálida a la más fría ›')}</Link>
            </p>
          </section>
        )}

        {/*
          El widget, dit com el que és: una cosa que es pot fer amb el web.

          Sota el cercador al PC i sota el mapa al mòbil, i és el mateix element:
          ho decideix la graella de `.home-top` amb `grid-template-areas`, no
          dues còpies. La miniatura és un dibuix fet amb les dades de Barcelona
          d'ara mateix —les de la primera targeta de capitals, que ja s'han
          llegit—, no una captura: així no envelleix i no costa cap petició.
        */}
        <Link href="/widget" className="home-promo">
          <span className="home-promo-mini" aria-hidden="true">
            {caps[0] && (
              <>
                <span className="home-promo-row">
                  {caps[0].code != null && <WeatherIcon code={caps[0].code} isDay={caps[0].isDay} size={40} lang={lang} />}
                  <span className="home-promo-temp tnum">{caps[0].temp != null ? `${num(caps[0].temp)}°` : '—'}</span>
                </span>
                <span className="home-promo-name">{placeName(caps[0].loc.nom, lang)}</span>
              </>
            )}
            <span className="home-promo-brand">Temps<b>Cat</b></span>
          </span>
          <span className="home-promo-text">
            <span className="home-promo-title">{t('El temps del vostre poble, a la vostra web', 'El tiempo de su pueblo, en su web')}</span>
            <span className="home-promo-lead">
              {t(
                'Gratuït i a mida: trieu el poble, la mida i què hi surt. Sense galetes.',
                'Gratuito y a medida: elija el pueblo, el tamaño y qué aparece. Sin cookies.',
              )}
            </span>
            <span className="home-promo-cta">{t('Creeu el vostre widget ›', 'Cree su widget ›')}</span>
          </span>
        </Link>
      </div>

      {caps.length > 0 && (
        <ul className="capitals" aria-label={t('Les quatre capitals, ara', 'Las cuatro capitales, ahora')}>
          {caps.map((c) => (
            <li key={c.loc.path}>
              <Link href={c.loc.path} className="capital">
                <span className="capital-name">{placeName(c.loc.nom, lang)}</span>
                <span className="capital-temp tnum">{c.temp != null ? `${num(c.temp)}°` : '—'}</span>
                {c.code != null && <WeatherIcon code={c.code} isDay={c.isDay} size={52} className="capital-icon" lang={lang} />}
                <span className="capital-cond tnum">
                  {[
                    c.code != null && codeLabel(weatherCode(c.code), lang),
                    c.tMax != null && c.tMin != null && `${num(c.tMax)}° / ${num(c.tMin)}°`,
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
              {groups.length} {groups.length === 1 ? t('avís', 'aviso') : 'avisos'} en vigor
            </strong>
            {es ? (
              <>{' '}· el más alto, {NIVEL[worst.level]} por {phenomenonName(worst.phenomenon, lang).toLowerCase()}.{' '}</>
            ) : (
              <>{' '}· el més alt, {worst.level} per {phenomenonName(worst.phenomenon).toLowerCase()}.{' '}</>
            )}
            <u>{t('Vegeu-los tots', 'Véalos todos')}</u>
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
          <h2 id="h-extrems" className="card-title mb-3">{t("Els extrems d'ara", 'Los extremos de ahora')}</h2>
          <div className="card">
            <ul className="extremes">
              {([
                [t('El més càlid', 'El más cálido'), 'thermometer', rank.stations.nowWarmest[0], (v: number) => `${num(v, 1)}°`],
                [t('El més fred', 'El más frío'), 'thermometer', rank.stations.nowColdest[0], (v: number) => `${num(v, 1)}°`],
                [t('Més pluja avui', 'Más lluvia hoy'), 'raindrop', rank.stations.rain[0], (v: number) => `${num(v, 1)} mm`],
                /*
                 * La ratxa ja ve en km/h.
                 *
                 * `rankings()` la converteix quan la desa i tornar-la a convertir
                 * aquí la multiplicava per 3,6 una segona vegada: el Monestir de
                 * Montserrat sortia a **180 km/h** una tarda de 37 °C.
                 */
                [t('Ratxa ara', 'Racha ahora'), 'wind', rank.stations.gust[0], (v: number) => `${v.toFixed(0)} km/h`],
              ] as const).map(([label, icon, row, fmt]) => {
                // Una fila sense estació no s'escriu.
                if (!row) return null;
                /*
                 * L'extrem és d'una estació, i porta el seu nom i la seva fitxa.
                 *
                 * Hi anava el poble més proper, i «−3,0° · Manyanet» atribuïa a
                 * un poble de 1.300 m la lectura de l'estació de Boí a 2.537,
                 * a quatre quilòmetres i mig.
                 */
                const name = row.nom;
                return (
                  <li key={label}>
                    <p className="card-label">
                      {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
                      <img src={`/icons/w/${icon}.svg`} width={20} height={20} alt="" />
                      {label}
                    </p>
                    <p className="extreme-value tnum">{fmt(row.value)}</p>
                    <Link href={`/estacions/${row.codi}`} className="extreme-place">{name}</Link>
                  </li>
                );
              })}
            </ul>
            {es ? (
              <p className="source">
                {rank.stations.total} estaciones del Meteocat con lectura reciente
                {rank.ageMin != null && ` · lectura ${ago(rank.ageMin, lang)}`}. La lluvia cuenta desde
                medianoche; la racha es la de la última lectura.{' '}
                <Link href="/ranquings" className="text-[var(--accent)]">Todas las listas</Link>.
              </p>
            ) : (
              <p className="source">
                {rank.stations.total} estacions del Meteocat amb lectura recent
                {rank.ageMin != null && ` · lectura ${ago(rank.ageMin)}`}. La pluja compta des de
                mitjanit; la ratxa és la de l&apos;última lectura.{' '}
                <Link href="/ranquings" className="text-[var(--accent)]">Totes les llistes</Link>.
              </p>
            )}
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
        <h2 id="h-explorar" className="card-title mb-3">{t('Explorar', 'Explorar')}</h2>
        {/* Les que no porten icona —les estacions, les dades obertes, l'estat—
            són del projecte i no del temps: viuen al peu. */}
        <ul className="explore">
          {sections(lang).flatMap((g) => g.links).filter((l) => l.icon).map((l) => (
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
        <h2 id="h-comarques" className="card-title mb-3">{t('Les 43 comarques', 'Las 43 comarcas')}</h2>
        <ul className="chips">
          {comarques.map((c) => (
            <li key={c.codi}><Link href={c.path}>{c.nom}</Link></li>
          ))}
        </ul>
      </section>
    </div>
  );
}
