import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, nauticalConditions, periodMeaning, type SeaStretch } from '@/lib/activities';
import { douglas, FLAG_SHOW_HOURS, flagStyle } from '@/lib/sea';
import { windCardinal } from '@/lib/variables';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { waveColor } from '@/lib/scales';
import { ago, dayTiny, fromDirection, int, num, theHour } from '@/lib/format';
import { buildTrams, slug, tramName, type Tram } from '@/lib/coast';
import { activeWarnings } from '@/lib/weather';
import { CoastalWarning } from '@/components/CoastalWarning';
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
  const [data, warnings] = await Promise.all([nauticalConditions(), activeWarnings()]);
  const stretches = data?.stretches ?? [];

  // Els mateixos trams que /mar, partits i anomenats igual.
  const trams = buildTrams(stretches, data?.beaches ?? []);
  const tramOf = (s: SeaStretch | null) => trams.find((t) => t.stretch === s) ?? null;
  const coasts: Array<[string, Tram[]]> = [];
  for (const t of trams) {
    const last = coasts.at(-1);
    if (last && last[0] === t.coast) last[1].push(t);
    else coasts.push([t.coast, [t]]);
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
            sub: `força ${beaufort(gustiest.wind.gustKmh).force}, a ${tramName(tramOf(gustiest)?.towns ?? [gustiest.near])}`,
          },
          roughest?.waveHeight != null && {
            label: 'Onada màxima',
            icon: 'tide-high',
            value: num(roughest.waveHeight, 1),
            unit: 'm',
            sub: `${douglas(roughest.waveHeight)}, a ${tramName(tramOf(roughest)?.towns ?? [roughest.near])}`,
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
                label: tramOf(s)?.towns[0] ?? s.near,
                tip: `${tramName(tramOf(s)?.towns ?? [s.near])}: ${num(s.waveHeight, 1)} m d'onada${
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

      <CoastalWarning warnings={warnings} />

      {/* Les costes, per saltar-hi. Són àncores: no cal cap script. */}
      {coasts.length > 1 && (
        <nav aria-label="Costes" className="mb-2">
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
        const gusts = list.map((t) => t.stretch.wind?.gustKmh).filter((v): v is number => v != null);
        const ws = list.map((t) => t.stretch.waveHeight).filter((v): v is number => v != null);
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
                {gusts.length > 0 && <>ratxes fins a {Math.max(...gusts)} km/h</>}
                {gusts.length > 0 && ws.length > 0 && ' · '}
                {ws.length > 0 && <>onades fins a {num(Math.max(...ws), 1)} m</>}
              </p>
            </div>
            <ul className="card-grid">
              {list.map((t) => <SailCard key={t.id} tram={t} />)}
            </ul>
          </section>
        );
      })}

      {stretches.length > 0 && (
        <p className="source mt-6">
          {windAge != null && <>Vent mesurat {ago(windAge)} a l&apos;estació de la XEMA més propera a cada tram. </>}
          Onatge, període i temperatura de l&apos;aigua, del model marí d&apos;Open-Meteo, de mar obert.
        </p>
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

/**
 * Un tram de costa per a qui surt a navegar: vent, onada i període junts, la
 * màxima de les pròximes 24 hores i els dies següents.
 */
function SailCard({ tram }: { tram: Tram }) {
  const s = tram.stretch;
  const w = s.wind;
  const wave = s.waveHeight;
  return (
    <li className="card tram scroll-mt-4" id={tram.id}>
      <h3 className="tram-name">{tramName(tram.towns)}</h3>

      <dl className="tram-now">
        <div>
          <dt>Vent</dt>
          <dd>
            {w?.kmh != null ? <>{w.kmh} km/h</> : '—'}
            {w?.kmh != null && (
              <small>
                {w.gustKmh != null ? `ratxa ${w.gustKmh} · ` : ''}F{beaufort(w.gustKmh ?? w.kmh).force}
                {w.direction != null && w.kmh > 0 && ` ${fromDirection(windCardinal(w.direction))}`}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>Onada</dt>
          <dd>
            {wave != null ? (
              <span
                className="temp-pill"
                style={{ background: waveColor(wave), color: wave >= 1.5 ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)' }}
              >
                {num(wave, 1)} m
              </span>
            ) : '—'}
            {wave != null && <small>{douglas(wave)}</small>}
          </dd>
        </div>
        <div>
          <dt>Període</dt>
          <dd>
            {s.wavePeriod != null ? <>{num(s.wavePeriod, 0)} s</> : '—'}
            {s.wavePeriod != null && <small>{periodMeaning(s.wavePeriod)}</small>}
          </dd>
        </div>
      </dl>

      {s.days.length > 1 && (
        <div>
          <p className="tram-days-label">
            Els pròxims dies · onada més alta
            {s.peak && <> (avui, {num(s.peak.height, 1)} m a {theHour(Number(s.peak.time.slice(11, 13)))})</>}
          </p>
          <ol className="tram-days" aria-label="Els pròxims dies">
            {s.days.map((d, i) => (
              <li key={d.date}>
                <span>{i === 0 ? 'avui' : dayTiny(`${d.date}T12:00`)}</span>
                <span className="tnum">{d.waveMax != null ? `${num(d.waveMax, 1)} m` : '—'}</span>
                <span className="text-[var(--muted)]">{d.waveMax != null ? douglas(d.waveMax) : ''}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="tram-src">
        {s.sst != null && <>aigua a {num(s.sst, 1)} °C</>}
        {s.sst != null && w?.kmh != null && ' · '}
        {w?.kmh != null
          ? <>vent mesurat a {w.station}, a {w.distKm} km</>
          : w ? 'l’estació més propera no dona vent' : 'cap estació a menys de 25 km'}
      </p>
    </li>
  );
}
