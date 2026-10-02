import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, nauticalConditions, periodMeaning, type SeaStretch } from '@/lib/activities';
import { douglas, FLAG_SHOW_HOURS, flagStyle } from '@/lib/sea';
import { windCardinal } from '@/lib/variables';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { waveColor } from '@/lib/scales';
import { ago, hourSpoken, int, num } from '@/lib/format';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { Fold } from '@/components/Fold';

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

export const metadata: Metadata = {
  title: 'Condicions per navegar: vent, onatge i període',
  description:
    'Vent mesurat, alçada i període de l’onada i temperatura de l’aigua a tota la '
    + 'costa catalana, tram a tram i de nord a sud.',
  alternates: { canonical: '/nautica' },
};

/** El tram amb el valor més alt, o res si cap no en porta. */
function maxBy(list: SeaStretch[], get: (s: SeaStretch) => number | null | undefined) {
  return list
    .filter((s) => get(s) != null)
    .sort((a, b) => (get(b) as number) - (get(a) as number))[0] ?? null;
}

export default async function NauticaPage() {
  const data = await nauticalConditions();
  const stretches = data?.stretches ?? [];

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
    { nom: 'Catalunya', path: '/' },
    { nom: 'Nàutica', path: '/nautica' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Nàutica"
        icon="wind"
        title="Es pot sortir a navegar?"
        lead={stretches.length === 0 ? 'Encara no hi ha dades del mar.' : (maxGust != null || maxWave != null) && (
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
        )}
        stats={[
          gustiest?.wind?.gustKmh != null && {
            label: 'Ratxa màxima',
            icon: 'wind',
            value: int(gustiest.wind.gustKmh),
            unit: 'km/h',
            sub: `força ${beaufort(gustiest.wind.gustKmh).force} · ${gustiest.near}`,
          },
          roughest?.waveHeight != null && {
            label: 'Onada màxima',
            icon: 'tide-high',
            value: num(roughest.waveHeight, 2),
            unit: 'm',
            sub: `${douglas(roughest.waveHeight)} · ${roughest.near}`,
          },
          sstMin != null && sstMax != null && {
            label: "Aigua",
            icon: 'thermometer',
            value: Math.round(sstMin) === Math.round(sstMax)
              ? num(sstMin, 0)
              : `${num(sstMin, 0)}–${num(sstMax, 0)}`,
            unit: '°C',
            sub: 'de tram a tram',
          },
        ]}
        note={stretches.length > 0 && (
          <>
            Vent mesurat a terra, a l&apos;estació de la XEMA més propera a cada tram
            {windAge != null && <>, {ago(windAge)}</>}. Onatge i temperatura de l&apos;aigua,
            del model marí d&apos;Open-Meteo, de mar obert. No substitueix cap butlletí
            oficial: abans de sortir, consulteu la predicció marítima de l&apos;AEMET i
            l&apos;autoritat portuària.
          </>
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
          <section className="card" aria-label="L'onada a cada tram de costa">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/tide-high.svg" width={22} height={22} alt="" />
              L&apos;onada, tram a tram
            </p>
            <PointsMap
              scale={2}
              outline={geo.features}
              projection={geo.projection}
              width={geo.width}
              height={geo.height}
              labels
              maxHeight={520}
              ariaLabel={`Mapa de la costa amb l'alçada de l'onada als ${mapped.length} trams`}
              points={mapped.map((s) => ({
                key: s.near,
                lat: s.lat,
                lon: s.lon,
                fill: waveColor(s.waveHeight as number),
                ink: (s.waveHeight as number) >= 1.5 ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)',
                value: num(s.waveHeight, 1),
                label: s.near,
                tip: `${s.near}: ${num(s.waveHeight, 1)} m d'onada${
                  s.wind?.gustKmh != null ? ` · ratxa ${Math.round(s.wind.gustKmh)} km/h` : ''}`,
              }))}
              footer={(
                <>
                  L&apos;alçada de l&apos;onada en metres, del mar pla al gruixut. Són els
                  punts del model, no boies: descriuen el mar obert, no una cala arrecerada.
                </>
              )}
            />
            <p className="card-foot"><Link href="/mar">Platges i temperatura de l&apos;aigua ›</Link></p>
          </section>
        )}
      />

      {stretches.length > 0 && (
        <Section id="costa" title="La costa, de nord a sud">
          <div className="card">
            <div className="scroll-x">
              <table className="data-table">
                <caption className="sr-only">
                  Vent mesurat, onatge modelat i temperatura de l&apos;aigua per trams de costa
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="min-w-[10rem]">Tram</th>
                    <th scope="col">Vent <span className="font-normal normal-case tracking-normal">mesurat</span></th>
                    <th scope="col">Onada</th>
                    <th scope="col">Període</th>
                    <th scope="col">Màxima 24 h</th>
                    <th scope="col" className="num">Aigua</th>
                  </tr>
                </thead>
                <tbody>
                  {stretches.map((s) => (
                    <tr key={s.near}>
                      <td>
                        <span className="block font-medium text-[var(--ink)]">{s.near}</span>
                        {s.wind?.kmh != null && (
                          <span className="block text-xs text-[var(--muted)]">
                            {s.wind.station}, a {s.wind.distKm} km
                          </span>
                        )}
                      </td>
                      <td className="tnum">
                        {s.wind?.kmh != null ? (
                          <>
                            <span className="whitespace-nowrap font-medium text-[var(--ink)]">{s.wind.kmh} km/h</span>
                            {s.wind.gustKmh != null && (
                              <span className="whitespace-nowrap"> · ratxa {s.wind.gustKmh}</span>
                            )}
                            <span className="block text-xs text-[var(--muted)]">
                              F{beaufort(s.wind.gustKmh ?? s.wind.kmh).force}
                              {s.wind.direction != null && ` · ${windCardinal(s.wind.direction)}`}
                            </span>
                          </>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">
                            {s.wind ? 'l’estació no dona vent' : 'cap estació a menys de 25 km'}
                          </span>
                        )}
                      </td>
                      <td className="tnum">
                        {s.waveHeight != null ? (
                          <>
                            <span
                              className="temp-pill"
                              style={{
                                background: waveColor(s.waveHeight),
                                color: s.waveHeight >= 1.5 ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)',
                              }}
                            >
                              {num(s.waveHeight, 2)} m
                            </span>
                            <span className="block pt-0.5 text-xs text-[var(--muted)]">{douglas(s.waveHeight)}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="tnum">
                        {s.wavePeriod != null ? (
                          <>
                            <span className="whitespace-nowrap">{num(s.wavePeriod, 1)} s</span>
                            <span className="block text-xs text-[var(--muted)]">{periodMeaning(s.wavePeriod)}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="tnum text-[var(--muted)]">
                        {s.peak ? (
                          <>
                            <span className="whitespace-nowrap text-[var(--ink-2)]">{num(s.peak.height, 2)} m</span>
                            <span className="block text-xs">a {hourSpoken(s.peak.time)}</span>
                          </>
                        ) : '—'}
                      </td>
                      <td className="num whitespace-nowrap font-medium text-[var(--ink)]">
                        {s.sst != null ? `${num(s.sst, 1)} °C` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="source">
              {windAge != null && <>Vent mesurat {ago(windAge)} · Meteocat XEMA. </>}
              Onatge i temperatura de l&apos;aigua, model marí d&apos;Open-Meteo.
            </p>
          </div>
        </Section>
      )}

      {flags.length > 0 && (
        <Section id="banderes" title="Banderes vigents" action={{ href: '/mar', label: 'Platja a platja' }}>
          <div className="card">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {[...new Set(flags.map((b) => b.flag))].map((f) => {
                const n = flags.filter((b) => b.flag === f).length;
                const st = flagStyle(f);
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
              Les banderes són per al bany i es refereixen a la vora. No descriuen
              l&apos;estat del mar a una milla de la costa, que és el que recull la
              taula de dalt.
            </p>
          </div>
        </Section>
      )}

      <div className="mt-10">
        <Fold title="Com es llegeix" summary="El període, el vent a terra i l'onatge de mar obert">
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
        </Fold>
      </div>
    </article>
  );
}
