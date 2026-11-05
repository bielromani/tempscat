import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, nauticalConditions, periodMeaning, type SeaStretch } from '@/lib/activities';
import { douglas, FLAG_SHOW_HOURS, flagStyle } from '@/lib/sea';
import { windCardinal } from '@/lib/variables';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { waveColor } from '@/lib/scales';
import { ago, dayTiny, fromDirection, int, num, placeName, theHour } from '@/lib/format';
import { buildTrams, slug, tramName, tramPhrase, type Tram } from '@/lib/coast';
import { activeWarnings } from '@/lib/weather';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';
import { CoastalWarning } from '@/components/CoastalWarning';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';
import { alternatesFor } from '@/lib/site';

/**
 * Condicions per sortir a navegar.
 *
 * ## Què hi ha aquí que no hi hagi a `/mar`
 *
 * `/mar` respon «puc banyar-me»: banderes, temperatura de l'aigua, meduses. És
 * la pregunta de qui va a la platja.
 *
 * Aquesta respon «puc sortir», que és una altra: **vent i ratxa, període
 * d'onada, i com anirà l'onatge les pròximes hores**. El vent és el que decideix
 * si es surt, i a `/mar` no hi és.
 *
 * ## El vent és mesurat; l'onatge, modelat
 *
 * I es diu quin és quin. L'onatge ve d'Open-Meteo i és mar obert; el vent surt
 * de l'estació de la XEMA més propera a cada tram, amb el seu nom i la seva
 * distància — perquè un anemòmetre a vuit quilòmetres terra endins **no mesura
 * el vent que hi ha a l'aigua**, i qui navega ho sap millor que nosaltres.
 *
 * ## L'avís de sota no es plega
 *
 * «No substitueix un butlletí oficial» va a la lletra petita de la capçalera, a
 * la vista, i no dins de l'explicació plegada del final: és l'única frase de la
 * pàgina que parla de seguretat.
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
    title: tr(lang, 'Condicions per navegar: vent, onatge i període', 'Condiciones para navegar: viento, oleaje y periodo'),
    description: tr(lang,
      'Vent mesurat, alçada i període de l’onada i temperatura de l’aigua a tota la '
      + 'costa catalana, tram a tram i de nord a sud.',
      'Viento medido, altura y periodo de la ola y temperatura del agua en toda la '
      + 'costa catalana, tramo a tramo y de norte a sur.'),
    alternates: alternatesFor('/nautica'),
  };
}

/** El tram amb el valor més alt, o res si cap no en porta. */
function maxBy(list: SeaStretch[], get: (s: SeaStretch) => number | null | undefined) {
  return list
    .filter((s) => get(s) != null)
    .sort((a, b) => (get(b) as number) - (get(a) as number))[0] ?? null;
}

export default async function NauticaPage() {
  const [data, warnings, lang] = await Promise.all([nauticalConditions(), activeWarnings(), getLang()]);
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const stretches = data?.stretches ?? [];

  // Els mateixos trams que /mar, partits i anomenats igual.
  const trams = buildTrams(stretches, data?.beaches ?? []);
  const tramOf = (s: SeaStretch | null) => trams.find((x) => x.stretch === s) ?? null;
  const coasts: Array<[string, Tram[]]> = [];
  for (const x of trams) {
    const last = coasts.at(-1);
    if (last && last[0] === x.coast) last[1].push(x);
    else coasts.push([x.coast, [x]]);
  }

  const gustiest = maxBy(stretches, (s) => s.wind?.gustKmh);
  const roughest = maxBy(stretches, (s) => s.waveHeight);
  const maxGust = gustiest?.wind?.gustKmh ?? null;
  const maxWave = roughest?.waveHeight ?? null;

  const ssts = stretches.map((s) => s.sst).filter((v): v is number => v != null);
  const sstMin = ssts.length ? Math.min(...ssts) : null;
  const sstMax = ssts.length ? Math.max(...ssts) : null;

  const geo = mapOutline();
  const mapped = stretches.filter((s) => s.waveHeight != null);

  const flags = (data?.beaches ?? []).filter((b) => b.ageHours <= FLAG_SHOW_HOURS);
  const red = flags.filter((b) => b.flag === 'vermella').length;

  const windAge = stretches.find((s) => s.wind)?.wind?.ageMin ?? null;

  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Nàutica', 'Náutica'), path: '/nautica' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('Nàutica', 'Náutica')}
        icon="wind"
        title={t('Es pot sortir a navegar?', '¿Se puede salir a navegar?')}
        lead={stretches.length === 0 ? t('Encara no hi ha dades del mar.', 'Todavía no hay datos del mar.') : (maxGust != null || maxWave != null) && (
          lang === 'es' ? (
            <>
              {maxGust != null && (
                <>
                  Rachas de hasta <strong>fuerza {beaufort(maxGust, lang).force}</strong>{' '}
                  ({beaufort(maxGust, lang).name})
                </>
              )}
              {maxGust != null && maxWave != null && ' y '}
              {maxWave != null && (
                <>
                  {maxGust != null ? 'olas' : 'Olas'} de hasta{' '}
                  <strong className="tnum">{num(maxWave, 1)} m</strong> ({douglas(maxWave, lang)})
                </>
              )}
              {' '}en la costa.
              {red > 0 && (
                <> Hay <strong style={{ color: 'var(--bad)' }}>
                  {red} {red === 1 ? 'playa con bandera roja' : 'playas con bandera roja'}
                </strong>.</>
              )}
            </>
          ) : (
            <>
              {maxGust != null && (
                <>
                  Ratxes de fins a <strong>força {beaufort(maxGust).force}</strong>{' '}
                  ({beaufort(maxGust).name})
                </>
              )}
              {maxGust != null && maxWave != null && ' i '}
              {maxWave != null && (
                <>
                  {maxGust != null ? 'onades' : 'Onades'} de fins a{' '}
                  <strong className="tnum">{num(maxWave, 1)} m</strong> ({douglas(maxWave)})
                </>
              )}
              {' '}a la costa.
              {red > 0 && (
                <> Hi ha <strong style={{ color: 'var(--bad)' }}>
                  {red} {red === 1 ? 'platja amb bandera vermella' : 'platges amb bandera vermella'}
                </strong>.</>
              )}
            </>
          )
        )}
        stats={[
          gustiest?.wind?.gustKmh != null && {
            label: t('Ratxa màxima', 'Racha máxima'),
            icon: 'wind',
            value: int(gustiest.wind.gustKmh),
            unit: 'km/h',
            sub: `${t('força', 'fuerza')} ${beaufort(gustiest.wind.gustKmh).force}, ${tramPhrase(tramOf(gustiest)?.towns ?? [gustiest.near], lang)}`,
          },
          roughest?.waveHeight != null && {
            label: t('Onada màxima', 'Ola máxima'),
            icon: 'tide-high',
            value: num(roughest.waveHeight, 1),
            unit: 'm',
            sub: `${douglas(roughest.waveHeight, lang)}, ${tramPhrase(tramOf(roughest)?.towns ?? [roughest.near], lang)}`,
          },
          sstMin != null && sstMax != null && {
            label: t('Aigua', 'Agua'),
            icon: 'thermometer',
            value: Math.round(sstMin) === Math.round(sstMax)
              ? num(sstMin, 0)
              : `${num(sstMin, 0)}–${num(sstMax, 0)}`,
            unit: '°C',
            sub: t('de tram a tram', 'de tramo a tramo'),
          },
        ]}
        note={stretches.length > 0 && (
          lang === 'es' ? (
            <>
              Viento medido en tierra, en la estación de la XEMA más cercana a cada tramo
              {windAge != null && <>, {ago(windAge, lang)}</>}. Oleaje y temperatura del agua,
              del modelo marino de Open-Meteo, de mar abierto. No sustituye ningún boletín
              oficial: antes de salir, consulte la predicción marítima de AEMET y
              la autoridad portuaria.
            </>
          ) : (
            <>
              Vent mesurat a terra, a l&apos;estació de la XEMA més propera a cada tram
              {windAge != null && <>, {ago(windAge)}</>}. Onatge i temperatura de l&apos;aigua,
              del model marí d&apos;Open-Meteo, de mar obert. No substitueix cap butlletí
              oficial: abans de sortir, consulteu la predicció marítima de l&apos;AEMET i
              l&apos;autoritat portuària.
            </>
          )
        )}
        aside={mapped.length > 0 && (
          /*
            Els vint trams del model, amb l'onada de cada un.

            La pàgina era una llista ordenada de nord a sud, i una llista ordenada
            no diu que a la Costa Brava i al delta hi sol haver mars diferents el
            mateix dia. En un país amb la costa en diagonal, el nom del tram no
            situa: el punt sí.

            El número de dins és l'alçada de l'onada en metres perquè és el que
            decideix si es surt, i el color va de la calma al mar gruixut. La
            temperatura de l'aigua ja té el seu mapa a /mar; aquí la pregunta és
            una altra.
          */
          <section className="card" aria-label={t("L'onada a cada tram de costa", 'La ola en cada tramo de costa')}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/tide-high.svg" width={22} height={22} alt="" />
              {t("L'onada, tram a tram", 'La ola, tramo a tramo')}
            </p>
            <PointsMap
              scale={2}
              outline={geo.features}
              projection={geo.projection}
              width={geo.width}
              height={geo.height}
              labels
              maxHeight={520}
              ariaLabel={t(
                `Mapa de la costa amb l'alçada de l'onada als ${mapped.length} trams`,
                `Mapa de la costa con la altura de la ola en los ${mapped.length} tramos`,
              )}
              points={mapped.map((s) => ({
                key: s.near,
                lat: s.lat,
                lon: s.lon,
                fill: waveColor(s.waveHeight as number),
                ink: (s.waveHeight as number) >= 1.5 ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)',
                value: num(s.waveHeight, 1),
                label: placeName(tramOf(s)?.towns[0] ?? s.near, lang),
                tip: lang === 'es'
                  ? `${tramName(tramOf(s)?.towns ?? [s.near], lang)}: ${num(s.waveHeight, 1)} m de ola${
                    s.wind?.gustKmh != null ? ` · racha ${Math.round(s.wind.gustKmh)} km/h` : ''}`
                  : `${tramName(tramOf(s)?.towns ?? [s.near])}: ${num(s.waveHeight, 1)} m d'onada${
                    s.wind?.gustKmh != null ? ` · ratxa ${Math.round(s.wind.gustKmh)} km/h` : ''}`,
              }))}
              footer={lang === 'es' ? (
                <>
                  La altura de la ola en metros, de la mar en calma a la gruesa. Son los
                  puntos del modelo, no boyas: describen el mar abierto, no una cala resguardada.
                </>
              ) : (
                <>
                  L&apos;alçada de l&apos;onada en metres, del mar pla al gruixut. Són els
                  punts del model, no boies: descriuen el mar obert, no una cala arrecerada.
                </>
              )}
            />
            <p className="card-foot"><Link href="/mar">{t("Platges i temperatura de l'aigua ›", 'Playas y temperatura del agua ›')}</Link></p>
          </section>
        )}
      />

      <CoastalWarning warnings={warnings} lang={lang} />

      {/* Les costes, per saltar-hi. Són àncores: no cal cap script. */}
      {coasts.length > 1 && (
        <nav aria-label={t('Costes', 'Costas')} className="mb-2">
          <ul className="chips">
            {coasts.map(([name]) => (
              <li key={name}><a href={`#costa-${slug(name)}`}>{name}</a></li>
            ))}
          </ul>
        </nav>
      )}

      {/*
        La costa, costa per costa.

        Fins al 9 d'octubre de 2026 era una taula de sis columnes que al mòbil
        calia arrossegar de costat. Ara és el mateix patró que /mar: una
        targeta per tram amb el vent, l'onada i el període junts, que són les
        tres coses que es miren a la vegada abans de sortir.
      */}
      {coasts.map(([name, list]) => {
        const gusts = list.map((x) => x.stretch.wind?.gustKmh).filter((v): v is number => v != null);
        const ws = list.map((x) => x.stretch.waveHeight).filter((v): v is number => v != null);
        return (
          <section
            key={name}
            id={`costa-${slug(name)}`}
            className="section scroll-mt-4"
            aria-labelledby={`h-${slug(name)}`}
          >
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`h-${slug(name)}`} className="card-title">{name}</h2>
              <p className="text-[13px] text-[var(--muted)] tnum">
                {gusts.length > 0 && <>{t('ratxes fins a', 'rachas de hasta')} {Math.max(...gusts)} km/h</>}
                {gusts.length > 0 && ws.length > 0 && ' · '}
                {ws.length > 0 && <>{t('onades fins a', 'olas de hasta')} {num(Math.max(...ws), 1)} m</>}
              </p>
            </div>
            <ul className="card-grid">
              {list.map((x) => <SailCard key={x.id} tram={x} lang={lang} />)}
            </ul>
          </section>
        );
      })}

      {stretches.length > 0 && (
        <p className="source mt-6">
          {lang === 'es' ? (
            <>
              {windAge != null && <>Viento medido {ago(windAge, lang)} en la estación de la XEMA más cercana a cada tramo. </>}
              Oleaje, periodo y temperatura del agua, del modelo marino de Open-Meteo, de mar abierto.
            </>
          ) : (
            <>
              {windAge != null && <>Vent mesurat {ago(windAge)} a l&apos;estació de la XEMA més propera a cada tram. </>}
              Onatge, període i temperatura de l&apos;aigua, del model marí d&apos;Open-Meteo, de mar obert.
            </>
          )}
        </p>
      )}

      {flags.length > 0 && (
        <Section
          id="banderes"
          title={t('Banderes vigents', 'Banderas vigentes')}
          action={{ href: '/mar', label: t('Platja a platja', 'Playa a playa') }}
        >
          <div className="card">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {[...new Set(flags.map((b) => b.flag))].map((f) => {
                const n = flags.filter((b) => b.flag === f).length;
                const st = flagStyle(f, lang);
                return (
                  <li key={f} className="flex items-center gap-2 text-[var(--ink-2)]">
                    <span
                      aria-hidden
                      className="inline-block h-3 w-3 rounded-full border border-[var(--line)]"
                      style={{ background: st.color }}
                    />
                    <span className="tnum">
                      {n} {n === 1 ? st.label.toLowerCase() : st.plural}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="source">
              {lang === 'es' ? (
                <>
                  Las banderas son para el baño y se refieren a la orilla. No describen
                  el estado del mar a una milla de la costa, que es lo que recogen las
                  tarjetas de arriba.
                </>
              ) : (
                <>
                  Les banderes són per al bany i es refereixen a la vora. No descriuen
                  l&apos;estat del mar a una milla de la costa, que és el que recull la
                  taula de dalt.
                </>
              )}
            </p>
          </div>
        </Section>
      )}

      <div className="mt-10">
        <Fold
          title={t('Com es llegeix', 'Cómo se lee')}
          summary={t("El període, el vent a terra i l'onatge de mar obert", 'El periodo, el viento en tierra y el oleaje de mar abierto')}
        >
          {lang === 'es' ? (
            <div className="card prose">
              <p>
                <strong>El periodo es el número que más dice.</strong> La misma altura
                de ola es una cosa con periodo corto y otra con periodo largo. Seis
                segundos son olas de viento, cortas y desordenadas, incómodas para todo. Nueve o
                más es mar de fondo venida de lejos, larga y regular: la que busca quien hace
                surf y la que menos molesta a quien navega.
              </p>
              <p>
                <strong>El viento es medido, y en tierra.</strong> Cada tramo dice de qué
                estación sale y a qué distancia está. Un anemómetro tierra adentro mide menos
                viento del que hay en el agua, y con viento de tierra la diferencia puede ser
                grande.
              </p>
              <p>
                <strong>El oleaje es de un modelo y es de mar abierto.</strong> No sabe nada
                de lo que pasa dentro de una cala, de las corrientes ni del mar contra un espigón.
              </p>
            </div>
          ) : (
            <div className="card prose">
              <p>
                <strong>El període és el número que més diu.</strong> La mateixa alçada
                d&apos;onada és una cosa amb període curt i una altra amb període llarg. Sis
                segons són onades de vent, curtes i desordenades, incòmodes per a tot. Nou o
                més és mar de fons vinguda de lluny, llarga i regular: la que busca qui fa
                surf i la que menys molesta a qui navega.
              </p>
              <p>
                <strong>El vent és mesurat, i a terra.</strong> Cada tram diu de quina
                estació surt i a quina distància és. Un anemòmetre terra endins mesura menys
                vent del que hi ha a l&apos;aigua, i amb vent de terra la diferència pot ser
                gran.
              </p>
              <p>
                <strong>L&apos;onatge és d&apos;un model i és de mar obert.</strong> No sap res
                del que passa dins d&apos;una cala, dels corrents ni de la mar contra un espigó.
              </p>
            </div>
          )}
        </Fold>
      </div>
    </article>
  );
}

/**
 * Un tram de costa per a qui surt a navegar: vent, onada i període junts, la
 * màxima de les pròximes 24 hores i els dies següents.
 */
function SailCard({ tram, lang }: { tram: Tram; lang: Lang }) {
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const s = tram.stretch;
  const w = s.wind;
  const wave = s.waveHeight;
  return (
    <li className="card tram scroll-mt-4" id={tram.id}>
      <h3 className="tram-name">{tramName(tram.towns, lang)}</h3>

      <dl className="tram-now">
        <div>
          <dt>{t('Vent', 'Viento')}</dt>
          <dd>
            {w?.kmh != null ? <>{w.kmh} km/h</> : '—'}
            {w?.kmh != null && (
              <small>
                {w.gustKmh != null ? `${t('ratxa', 'racha')} ${w.gustKmh} · ` : ''}F{beaufort(w.gustKmh ?? w.kmh).force}
                {w.direction != null && w.kmh > 0 && ` ${fromDirection(windCardinal(w.direction), lang)}`}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('Onada', 'Ola')}</dt>
          <dd>
            {wave != null ? (
              <span
                className="temp-pill"
                style={{ background: waveColor(wave), color: wave >= 1.5 ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)' }}
              >
                {num(wave, 1)} m
              </span>
            ) : '—'}
            {wave != null && <small>{douglas(wave, lang)}</small>}
          </dd>
        </div>
        <div>
          <dt>{t('Període', 'Periodo')}</dt>
          <dd>
            {s.wavePeriod != null ? <>{num(s.wavePeriod, 0)} s</> : '—'}
            {s.wavePeriod != null && <small>{periodMeaning(s.wavePeriod, lang)}</small>}
          </dd>
        </div>
      </dl>

      {s.days.length > 1 && (
        <div>
          <p className="tram-days-label">
            {t('Els pròxims dies · onada més alta', 'Los próximos días · ola más alta')}
            {s.peak && (lang === 'es'
              ? <> (hoy, {num(s.peak.height, 1)} m a {theHour(Number(s.peak.time.slice(11, 13)), true, lang)})</>
              : <> (avui, {num(s.peak.height, 1)} m a {theHour(Number(s.peak.time.slice(11, 13)))})</>)}
          </p>
          <ol className="tram-days" aria-label={t('Els pròxims dies', 'Los próximos días')}>
            {s.days.map((d, i) => (
              <li key={d.date}>
                <span>{i === 0 ? t('avui', 'hoy') : dayTiny(`${d.date}T12:00`, lang)}</span>
                <span className="tnum">{d.waveMax != null ? `${num(d.waveMax, 1)} m` : '—'}</span>
                <span className="text-[var(--muted)]">{d.waveMax != null ? douglas(d.waveMax, lang) : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="tram-src">
        {s.sst != null && <>{t('aigua a', 'agua a')} {num(s.sst, 1)} °C</>}
        {s.sst != null && w?.kmh != null && ' · '}
        {w?.kmh != null
          ? <>{t('vent mesurat a', 'viento medido en')} {w.station}, a {w.distKm} km</>
          : w
            ? t('l’estació més propera no dona vent', 'la estación más cercana no da viento')
            : t('cap estació a menys de 25 km', 'ninguna estación a menos de 25 km')}
      </p>
    </li>
  );
}
