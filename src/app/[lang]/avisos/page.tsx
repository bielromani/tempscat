import type { Metadata } from 'next';
import Link from 'next/link';
import { WarningBanner } from '@/components/WarningBanner';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';
import { comarcaName, dateTimeLong } from '@/lib/format';
import { phenomenonName, thresholdValue } from '@/lib/warning-labels';
import { LEVEL_RANK, type Warning, type WarningLevel } from '@/lib/warning-stack';
import { activeWarnings, groupWarnings } from '@/lib/weather';
import { mapOutline, warningOverlay, type WarningOverlay } from '@/lib/map';
import { projectToMap } from '@/lib/mercator';
import { allComarques } from '@/lib/territory';
import { pushAlertsAvailable } from '@/lib/push-available';
import { AMBITS, groupByZone } from '@/lib/zones';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';

/**
 * Los avisos oficiales vigentes, por comarca.
 *
 * Las reglas de los avisos no cambian por estar en su propia página, y son las
 * mismas que en la franja de cada ficha: **colores oficiales del CAP, texto sin
 * reescribir, nivel sin ajustar, y siempre quién lo emite con enlace al
 * original.** Un aviso mal presentado no es un fallo de diseño, es un riesgo.
 *
 * Los verdes no llegan aquí: verde significa «sin aviso», y llenar la página con
 * eso restaría fuerza a los que sí importan.
 *
 * Se genera en cada petición y el CDN la guarda cinco minutos, no los quince del
 * worker. La diferencia no es cosmética: en un episodio, quince minutos de retraso
 * en una página que se consulta **porque** hay un aviso son quince minutos de más.
 *
 * ## El mapa de la cabecera va por zona, no por comarca
 *
 * Pintar de naranja las comarcas que un aviso toca sería inventarse una frontera:
 * un aviso del Pirineu de Girona no llega a toda la Garrotxa, y una comarca
 * entera de color diría que sí. Se dibujan los polígonos de Meteoalerta, que son
 * la unidad en que AEMET los emite, encima de las comarcas en gris. Es la misma
 * geometría que el mapa que se mueve (`warningOverlay()`), proyectada aquí con
 * la misma fórmula que el mapa de temperaturas (`projectToMap()`), así que las
 * dos capas cuadran sin una línea de JavaScript.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Avisos meteorològics vigents a Catalunya', 'Avisos meteorológicos vigentes en Cataluña'),
    description: tr(lang,
      'Els avisos oficials de l\'AEMET en vigor ara mateix, per comarca, amb el text '
      + 'original i l\'enllaç a la font.',
      'Los avisos oficiales de AEMET en vigor ahora mismo, por comarca, con el texto '
      + 'original y el enlace a la fuente.'),
    alternates: { canonical: '/avisos' },
  };
}

/** Els colors oficials, els mateixos que la targeta. No se n'inventa cap. */
const CAP: Record<WarningLevel, string> = {
  verd: 'var(--cap-green)',
  groc: 'var(--cap-yellow)',
  taronja: 'var(--cap-orange)',
  vermell: 'var(--cap-red)',
};

const ICON: Partial<Record<WarningLevel, string>> = {
  groc: 'code-yellow',
  taronja: 'code-orange',
  vermell: 'code-red',
};

/** El nivell dit en castellà; en català, el codi ja és la paraula. */
const NIVEL: Record<WarningLevel, string> = { verd: 'verde', groc: 'amarillo', taronja: 'naranja', vermell: 'rojo' };
const levelWord = (level: WarningLevel, lang: Lang) => (lang === 'es' ? NIVEL[level] : level);

/**
 * Els noms dels àmbits en castellà. Els que són topònims —Penedès, Ponent— no
 * es tradueixen; els que són descripció, sí. La clau segueix sent la catalana.
 */
const AMBITO: Record<string, string> = {
  'Comarques gironines': 'Comarcas gerundenses',
  'Comarques centrals': 'Comarcas centrales',
  'Àmbit metropolità': 'Ámbito metropolitano',
};

/** Del més alt al més baix, que és l'ordre en què es llegeixen. */
const LEVELS: WarningLevel[] = ['vermell', 'taronja', 'groc'];

/**
 * Les zones amb avís, damunt de les comarques.
 *
 * Els anells d'AEMET venen en graus i el mapa de comarques ja està projectat al
 * build: `projectToMap()` és la fórmula que el build va fer servir, publicada
 * al mateix fitxer, i per això les dues capes quadren. Es dibuixen de menys a
 * més greu perquè, on una franja costanera se solapa amb la de terra —ho fa a
 * posta—, quedi a sobre el color més alt.
 */
function ZonesMap({ overlay, lang }: { overlay: WarningOverlay; lang: Lang }) {
  const { width, height, projection, features } = mapOutline();
  const zones = [...overlay.geojson.features]
    .sort((a, b) => LEVEL_RANK[a.properties.level] - LEVEL_RANK[b.properties.level]);

  const ring = (points: Array<[number, number]>) => points
    .map(([lon, lat], i) => {
      const [x, y] = projectToMap(lon, lat, projection);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('') + 'Z';

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={tr(lang,
        `Mapa de Catalunya amb les ${overlay.zones} zones que tenen avís vigent`,
        `Mapa de Cataluña con las ${overlay.zones} zonas que tienen aviso vigente`)}
      className="block h-auto w-full"
    >
      <g fill="var(--land)" stroke="var(--line)" strokeWidth={1.2} strokeLinejoin="round">
        {features.map((f) => <path key={f.code} d={f.d} />)}
      </g>
      {zones.map((z, i) => (
        <path
          key={`${z.properties.code}-${i}`}
          d={z.geometry.coordinates.map(ring).join('')}
          fill={CAP[z.properties.level]}
          fillOpacity={0.42}
          stroke={CAP[z.properties.level]}
          strokeWidth={3}
          strokeLinejoin="round"
        >
          <title>{`${z.properties.nom}: ${z.properties.text}`}</title>
        </path>
      ))}
    </svg>
  );
}

/** L'hora de l'AEMET, en hora de Madrid i escrita com es diu. */
function until(iso: string, lang: Lang): string {
  // L'AEMET tanca a les hh:59:59; un segon més i és l'hora en punt.
  const t = new Date(iso);
  if (t.getUTCSeconds() === 59) t.setUTCSeconds(60);
  return dateTimeLong(
    t.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T'),
    lang,
  );
}

/**
 * Les línies d'una comarca: fenomen, llindar, nivell i fins quan.
 *
 * Porten el llindar perquè sense ell una comarca amb dues zones i dos llindars
 * de pluja —40 mm en 1 h i 100 mm en 12 h— sortia amb quatre línies idèntiques
 * de «Pluja · nivell taronja», i el lector havia de suposar si eren la mateixa
 * cosa. Amb el llindar es distingeixen, i les que **sí** que queden idèntiques
 * lletra per lletra —el mateix avís en dues zones de la comarca— es diuen un
 * cop: repetir-les no hi afegeix res que es pugui llegir.
 */
function linesOf(list: Warning[], lang: Lang) {
  const out = new Map<string, { key: string; level: WarningLevel; what: string; rest: string }>();
  const sorted = [...list].sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
  for (const w of sorted) {
    const th = thresholdValue(w.threshold);
    const what = th ? `${phenomenonName(w.phenomenon, lang)} ${th}` : phenomenonName(w.phenomenon, lang);
    const rest = tr(lang,
      `nivell ${w.level} · fins ${until(w.expires, lang)}`,
      `nivel ${levelWord(w.level, lang)} · hasta ${until(w.expires, lang)}`);
    const key = `${what}|${rest}`;
    if (!out.has(key)) out.set(key, { key, level: w.level, what, rest });
  }
  return [...out.values()];
}

export default async function AvisosPage() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const [warnings, overlay] = await Promise.all([activeWarnings(), warningOverlay(lang)]);
  const comarques = allComarques();

  /*
   * Los grupos, y el número que se enseña es el de los grupos.
   *
   * AEMET emite un fichero por día y por zona: hoy son 18 avisos que son 7
   * situaciones. Decir «18 avisos en vigor» encima de siete tarjetas obliga al
   * lector a contar para descubrir que no cuadra.
   */
  const groups = groupWarnings(warnings);

  // Una comarca puede tener varios avisos y un aviso puede cubrir varias
  // comarcas: la relación es de muchos a muchos y viene resuelta por geometría
  // desde el worker, no por nombre de zona.
  const byComarca = comarques
    .map((c) => ({ c, list: warnings.filter((w) => w.comarcaCodis.includes(c.codi)) }))
    .filter((x) => x.list.length > 0)
    .map(({ c, list }) => ({ c, list, lines: linesOf(list, lang) }));

  // Per àmbits del Pla territorial: amb vint comarques amb avís, una llista
  // sola obligava a buscar la pròpia entre totes.
  const byAmbit = groupByZone(AMBITS, byComarca, (x) => x.c.nom);

  // Ya vienen ordenados por nivel descendente desde `groupWarnings()`.
  const worst = groups[0];

  /* Quants avisos de cada nivell, i de què. */
  const perLevel = LEVELS
    .map((level) => {
      const of = groups.filter((g) => g.level === level);
      const what = [...new Set(of.map((g) => phenomenonName(g.phenomenon, lang).toLowerCase()))];
      return { level, n: of.length, what };
    })
    .filter((x) => x.n > 0);

  /* Les zones del mapa, una per codi: un codi pot portar més d'un anell. */
  const zoneLevels = new Map<string, WarningLevel>();
  for (const f of overlay?.geojson.features ?? []) zoneLevels.set(f.properties.code, f.properties.level);
  const zonesPerLevel = LEVELS
    .map((level) => ({ level, n: [...zoneLevels.values()].filter((l) => l === level).length }))
    .filter((x) => x.n > 0);

  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: 'Avisos', path: '/avisos' },
  ];

  return (
    <article data-wide>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('Avisos oficials', 'Avisos oficiales')}
        icon={worst ? ICON[worst.level] : undefined}
        title={t('Avisos oficials vigents', 'Avisos oficiales vigentes')}
        lead={lang === 'es' ? (warnings.length === 0 ? (
          <>
            Ahora mismo <strong>no hay ningún aviso amarillo, naranja ni rojo</strong>{' '}
            en vigor en Cataluña.
          </>
        ) : (
          <>
            Hay{' '}
            <strong className="tnum">
              {groups.length} {groups.length === 1 ? 'aviso' : 'avisos'}
            </strong>{' '}
            en vigor, que {groups.length === 1 ? 'afecta' : 'afectan'} a{' '}
            <span className="tnum">{byComarca.length}</span>{' '}
            {byComarca.length === 1 ? 'comarca' : 'comarcas'}.
            {worst && (
              <> El más alto es de nivel <strong>{levelWord(worst.level, lang)}</strong>, por{' '}
                {phenomenonName(worst.phenomenon, lang).toLowerCase()}.</>
            )}
          </>
        )) : warnings.length === 0 ? (
          <>
            Ara mateix <strong>no hi ha cap avís groc, taronja ni vermell</strong>{' '}
            en vigor a Catalunya.
          </>
        ) : (
          <>
            Hi ha{' '}
            <strong className="tnum">
              {groups.length} {groups.length === 1 ? 'avís' : 'avisos'}
            </strong>{' '}
            en vigor, que {groups.length === 1 ? 'afecta' : 'afecten'}{' '}
            <span className="tnum">{byComarca.length}</span>{' '}
            {byComarca.length === 1 ? 'comarca' : 'comarques'}.
            {worst && (
              <> El més alt és de nivell <strong>{worst.level}</strong>, per{' '}
                {phenomenonName(worst.phenomenon).toLowerCase()}.</>
            )}
          </>
        )}
        stats={warnings.length > 0 ? [
          ...perLevel.map((x) => ({
            label: tr(lang, `Nivell ${x.level}`, `Nivel ${levelWord(x.level, lang)}`),
            icon: ICON[x.level],
            value: String(x.n),
            unit: x.n === 1 ? t('avís', 'aviso') : 'avisos',
            sub: x.what.join(', '),
          })),
          {
            label: t('Comarques', 'Comarcas'),
            value: String(byComarca.length),
            unit: `de ${comarques.length}`,
            sub: <Link href="#comarques">{t('amb algun avís ›', 'con algún aviso ›')}</Link>,
          },
        ] : undefined}
        note={lang === 'es' ? (
          <>
            Los emite la Agencia Estatal de Meteorología. Para decisiones de
            seguridad, la fuente son AEMET, el Meteocat y Protecció Civil.
          </>
        ) : (
          <>
            Els emet l&apos;Agència Estatal de Meteorologia. Per a decisions de
            seguretat, la font són l&apos;AEMET, el Meteocat i Protecció Civil.
          </>
        )}
        aside={overlay && warnings.length > 0 ? (
          <section className="card" aria-labelledby="h-zones">
            <h2 id="h-zones" className="card-label">
              {worst && ICON[worst.level] && (
                /* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */
                <img src={`/icons/w/${ICON[worst.level]}.svg`} width={22} height={22} alt="" />
              )}
              {t('On són', 'Dónde están')}
            </h2>
            <div className="mx-auto max-w-[24rem]">
              <ZonesMap overlay={overlay} lang={lang} />
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--ink-2)]">
              {zonesPerLevel.map((x) => (
                <li key={x.level} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: CAP[x.level] }}
                  />
                  <span className="tnum">
                    {lang === 'es'
                      ? <>{x.n} {x.n === 1 ? 'zona' : 'zonas'} de nivel {levelWord(x.level, lang)}</>
                      : <>{x.n} {x.n === 1 ? 'zona' : 'zones'} de nivell {x.level}</>}
                  </span>
                </li>
              ))}
            </ul>
            {lang === 'es' ? (
              <p className="source">
                Zonas de Meteoalerta, la unidad en que AEMET emite los avisos. Cuando
                una zona tiene más de uno, el color es el del más alto.
              </p>
            ) : (
              <p className="source">
                Zones de Meteoalerta, la unitat en què l&apos;AEMET emet els avisos. Quan
                una zona en té més d&apos;un, el color és el del més alt.
              </p>
            )}
            <p className="card-foot">
              <Link href="/radar?avisos=1">{t('Al mapa del radar, que es pot moure ›', 'En el mapa del radar, que se puede mover ›')}</Link>
            </p>
          </section>
        ) : undefined}
      />

      {/* Les seccions, per saltar-hi. Sense avisos només n'hi ha una, i no cal. */}
      {warnings.length > 0 && (
        <nav aria-label={t('Seccions', 'Secciones')} className="mt-6 mb-2">
          <ul className="chips">
            <li><a href="#llista">{t('Tots els avisos ', 'Todos los avisos ')}<span>{groups.length}</span></a></li>
            <li><a href="#comarques">{t('Per comarca ', 'Por comarca ')}<span>{byComarca.length}</span></a></li>
            <li><a href="#subscripcio">{t("Rebre'ls sense entrar", 'Recibirlos sin entrar')}</a></li>
          </ul>
        </nav>
      )}

      {warnings.length > 0 && (
        <>
          <Section id="llista" title={t('Tots els avisos', 'Todos los avisos')}>
            <WarningBanner warnings={groups} variant="llista" lang={lang} />
          </Section>

          <Section id="comarques" title={t('Per comarca', 'Por comarca')}>
            {byAmbit.map(([ambit, list]) => (
              <div key={ambit} className="card card-block">
                <h3 className="card-label">
                  {lang === 'es' ? AMBITO[ambit] ?? ambit : ambit} <span className="tnum font-medium normal-case tracking-normal">· {list.length}</span>
                </h3>
                <ul
                  className="rows rows-cols"
                  /* Columnes més amples que les de sèrie: cada línia diu fenomen,
                     nivell i fins quan, i a 14 rem es partia en tres. */
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 20rem), 1fr))' }}
                >
                  {list.map(({ c, lines }) => (
                    // Amunt i no al mig: cada comarca porta un nombre diferent de
                    // línies, i centrades, els noms d'una mateixa fila no quadraven.
                    <li key={c.codi} style={{ alignItems: 'flex-start' }}>
                      <div className="row-main flex-1">
                        <Link href={c.path} className="row-title">{comarcaName(c.nom, lang)}</Link>
                        <ul className="mt-1 space-y-0.5">
                          {lines.map((l) => (
                            <li key={l.key} className="flex items-baseline gap-1.5 text-[12.5px] leading-snug text-[var(--muted)]">
                              <span
                                aria-hidden
                                className="inline-block h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                                style={{ background: CAP[l.level] }}
                              />
                              <span>
                                <span className="text-[var(--ink-2)]">{l.what}</span> · {l.rest}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div>
              {lang === 'es' ? (
                <p className="source">
                  Los avisos se asignan a las comarcas por geometría y no por el nombre
                  de la zona: los polígonos de AEMET no siguen los límites
                  comarcales, y emparejarlos por el nombre daría avisos a municipios que
                  no los tienen.
                </p>
              ) : (
                <p className="source">
                  Els avisos s&apos;assignen a les comarques per geometria i no pel nom
                  de la zona: els polígons de l&apos;AEMET no segueixen els límits
                  comarcals, i emparellar-los pel nom donaria avisos a municipis que
                  no en tenen.
                </p>
              )}
            </div>
          </Section>
        </>
      )}

      <Section id="subscripcio" title={t('Rebre’ls sense entrar', 'Recibirlos sin entrar')}>
        <div className="card">
          {lang === 'es' ? (
            <p className="measure text-[15px] leading-relaxed text-[var(--ink-2)]">
              Como feed o como calendario, de toda Cataluña o de una comarca.
              No hace falta registro ni permiso de notificaciones, y no se guarda ningún dato de
              quien se suscribe: el archivo lo va a buscar su lector.
            </p>
          ) : (
            <p className="measure text-[15px] leading-relaxed text-[var(--ink-2)]">
              Com a feed o com a calendari, de tot Catalunya o d&apos;una comarca.
              No cal registre ni permís de notificacions, i no es desa cap dada de
              qui s&apos;hi subscriu: el fitxer el va a buscar el vostre lector.
            </p>
          )}
          <ul className="rows mt-3">
            {pushAlertsAvailable() && (
              <li>
                <Link href="/avisos/alertes" className="row-main">
                  <span className="row-title">{t('Al mòbil, els taronja i vermells', 'En el móvil, los naranjas y rojos')}</span>
                  <span className="row-sub">{t('Una notificació per als llocs que trieu', 'Una notificación para los lugares que elija')}</span>
                </Link>
              </li>
            )}
            <li>
              <Link href="/avisos/feed" className="row-main">
                <span className="row-title">{t('Tot Catalunya, feed Atom', 'Toda Cataluña, feed Atom')}</span>
                <span className="row-sub font-mono">/avisos/feed</span>
              </Link>
            </li>
            <li>
              <Link href="/avisos/feed/bages" className="row-main">
                <span className="row-title">{t('Una comarca, feed Atom', 'Una comarca, feed Atom')}</span>
                <span className="row-sub font-mono">/avisos/feed/{'{comarca}'}</span>
              </Link>
            </li>
            <li>
              <Link href="/avisos/feed?format=ics" className="row-main">
                <span className="row-title">{t('Calendari subscribible', 'Calendario para suscribirse')}</span>
                <span className="row-sub font-mono">/avisos/feed?format=ics</span>
              </Link>
            </li>
          </ul>
          {lang === 'es' ? (
            <p className="source">
              En el calendario, cada aviso ocupa su ventana de vigencia. Los
              naranjas y los rojos llevan un recordatorio dos horas antes; los
              amarillos, no.
            </p>
          ) : (
            <p className="source">
              Al calendari, cada avís ocupa la seva finestra de vigència. Els
              taronges i els vermells porten un recordatori dues hores abans; els
              grocs, no.
            </p>
          )}
        </div>
      </Section>

      <Fold
        title={t('D’on surten i com es llegeixen', 'De dónde salen y cómo se leen')}
        summary={t('De l’AEMET, en castellà i en anglès; el nivell i la zona, tal com surten',
          'De AEMET, en castellano y en inglés; el nivel y la zona, tal como salen')}
      >
        {lang === 'es' ? (
          <div className="card prose">
            <p>
              AEMET publica los avisos en castellano y en inglés. El nivel, el
              color, la zona, el horario y el umbral se reproducen tal como
              salen; el texto oficial va entero en cada aviso, en su idioma y con
              el enlace al original.
            </p>
            <p>
              Un archivo de AEMET vale para un día y una zona. Los que solo
              cambian de día se juntan en un solo aviso, con el umbral de cada
              día cuando no es el mismo.
            </p>
          </div>
        ) : (
        <div className="card prose">
          <p>
            L&apos;AEMET publica els avisos en castellà i en anglès. El nivell, el
            color, la zona, l&apos;horari i el llindar es reprodueixen tal com
            surten; el text oficial va sencer a cada avís, en el seu idioma i amb
            l&apos;enllaç a l&apos;original.
          </p>
          <p>
            Un fitxer de l&apos;AEMET val per a un dia i una zona. Els que només
            canvien de dia s&apos;ajunten en un sol avís, amb el llindar de cada
            dia quan no és el mateix.
          </p>
        </div>
        )}
      </Fold>
    </article>
  );
}
