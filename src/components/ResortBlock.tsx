/* eslint-disable @next/next/no-img-element -- El perquè és a eslint.config.mjs: el worker ja
   ha desat cada fotograma en les dues mides que el web ensenya, i `next/image` només hi
   afegiria una quota de plataforma per repetir una feina feta. */
import Link from 'next/link';
import { ago, dateFull, deWord, int, num } from '@/lib/format';
import { cameraImage, type CameraNow } from '@/lib/cameras';
import { windCardinal } from '@/lib/variables';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { REPORT_SHOW_HOURS, type ResortNow, type StationNow } from '@/lib/mountain';

/**
 * Una estació de muntanya: què hi ha obert, quanta neu i quina temperatura.
 *
 * Tres blocs amb tres rellotges diferents, i per això es presenten per separat:
 *
 *  · **El catàleg** —cotes, pistes, remuntadors— no caduca mai.
 *  · **El comunicat** el tecleja el personal de l'estació i caduca en hores.
 *  · **Les estacions meteorològiques** mesuren cada quart d'hora tot l'any.
 *
 * Fora de temporada això vol dir que la targeta segueix dient coses certes: el
 * desnivell, la temperatura a 2.500 m i la data de l'últim comunicat.
 *
 * ## Les càmeres, i per què només les d'ara mateix
 *
 * Una foto de la pista val més que el gruix comunicat, que el tecleja algú al
 * matí. Però aquí no hi ha lloc per posar-hi l'hora al costat: una imatge dins
 * d'una targeta que parla de neu es llegeix com si fos d'ara, i cinc de les
 * vint-i-quatre càmeres d'FGC han estat mesos aturades servint el mateix
 * fotograma amb un 200. Per això dins la targeta només hi entren les vigents
 * —menys de 90 minuts— i la resta es queden a `/cameres`, on sí que hi ha lloc
 * per dir de quan són.
 *
 * ## Dels itineraris se'n compten quatre menes i se'n descriu una
 *
 * Els d'esquí de muntanya porten dificultat, longitud, desnivell i les dues
 * cotes, tots vint-i-dos: aquests van desplegats. Dels de senderisme, raquetes
 * i fora de pista només se'n diu quants n'hi ha, perquè de 65 només 9 porten
 * cota i una taula amb els forats tapats seria una taula inventada.
 *
 * ## Les dates, sense preposició davant
 *
 * «L'últim comunicat és del {data}» fa «del 1 d'octubre» un dia de cada quinze:
 * davant de l'1 i de l'11 va «de l'». No hi ha cap funció que ho resolgui per a
 * les dates, així que la frase es construeix amb dos punts i la data sola.
 */
export function ResortBlock({
  resort, stations, cameras = [], snowShare, distKm,
}: {
  resort: ResortNow;
  stations: StationNow[];
  /** Les càmeres de l'estació, ja filtrades a les vigents. */
  cameras?: CameraNow[];
  /** Part del desnivell per damunt de la cota de neu prevista. Només a les fitxes. */
  snowShare?: number | null;
  distKm?: number;
}) {
  const { slopes, lifts } = resort;
  const hasSnow = resort.reportUsable && resort.snowMaxCm != null && resort.snowMaxCm > 0;

  return (
    /* L'ancora es perque el cercador hi pugui portar: /neu#e-la-molina. */
    <div id={`e-${resort.slug}`} className="card flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="card-title">{resort.name}</h3>
          {/* El catàleg tècnic: no depèn de cap comunicat. */}
          {(slopes || lifts || distKm != null) && (
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--muted)]">
              {[
                slopes?.minM != null && slopes.maxM != null && `${int(slopes.minM)}–${int(slopes.maxM)} m`,
                slopes && `${int(slopes.count)} ${slopes.count === 1 ? 'pista' : 'pistes'}`,
                slopes?.km != null && `${num(slopes.km, 1)} km`,
                lifts && `${int(lifts.count)} ${lifts.count === 1 ? 'remuntador' : 'remuntadors'}`,
                distKm != null && `a ${num(distKm, 0)} km`,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
        <span
          className="mt-0.5 shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={resort.open
            ? { background: 'var(--good)', borderColor: 'var(--good)', color: 'var(--paper)' }
            : { borderColor: 'var(--line)', color: 'var(--muted)' }}
        >
          {resort.openLabel}
        </span>
      </div>

      {resort.circuits.length > 0 && (
        <p className="mt-1 text-[13px] leading-snug text-[var(--muted)]">
          Itineraris: {resort.circuits.map((c) => `${int(c.count)} ${deWord(c.kind)}`).join(' · ')}
        </p>
      )}

      {/* El comunicat, mentre val. */}
      {resort.reportUsable ? (
        <div className="mt-4">
          {hasSnow && (
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className="tnum text-[32px] font-semibold leading-none tracking-tight text-[var(--ink)]">
                {resort.snowMinCm != null && resort.snowMinCm !== resort.snowMaxCm
                  ? `${int(resort.snowMinCm)}–${int(resort.snowMaxCm)}`
                  : int(resort.snowMaxCm)}
              </span>
              <span className="text-[var(--muted)]">cm de neu</span>
              {resort.snowQuality && (
                <span className="text-[var(--ink-2)]">· {resort.snowQuality.toLowerCase()}</span>
              )}
            </p>
          )}

          {resort.lastSnowfall && (
            <p className="mt-1.5 text-[13px] text-[var(--muted)]">
              Última nevada: {resort.lastSnowfall}
              {resort.lastSnowfallCm != null && `, ${int(resort.lastSnowfallCm)} cm`}
            </p>
          )}

          <p className="mt-1.5 text-[13.5px] text-[var(--ink-2)]">
            {[
              resort.slopesOpenPct != null && `pistes obertes ${int(resort.slopesOpenPct)} %`,
              resort.liftsOpenPct != null && `remuntadors ${int(resort.liftsOpenPct)} %`,
              resort.sky && resort.sky.toLowerCase(),
              resort.visibility && `visibilitat ${resort.visibility.toLowerCase()}`,
            ].filter(Boolean).join(' · ')}
          </p>

          <p className="source mt-1!">
            Comunicat de l&apos;estació · {ago(resort.ageHours * 60)}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--muted)]">
          Últim comunicat de l&apos;estació: {dateFull(resort.reportAt)}. Passades{' '}
          {REPORT_SHOW_HOURS} hores no se n&apos;ensenya el gruix de neu ni les pistes obertes.
        </p>
      )}

      {/* Les estacions meteorològiques, que no s'aturen mai. */}
      {stations.length > 0 && (
        <div className="mt-4">
          <dl className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
            {stations.map((s) => (
              <div
                key={s.id}
                className="rounded-[14px] border border-[var(--glass-line)] bg-[var(--glass)] px-3 py-2"
              >
                <dt className="tnum text-[12px] font-semibold text-[var(--muted)]">
                  {s.altitudM != null ? `${int(s.altitudM)} m` : s.name}
                </dt>
                <dd className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-[var(--muted)]">
                  {s.temperature != null ? (
                    <span
                      className="temp-pill"
                      style={{ background: temperatureColor(s.temperature), color: temperatureInk(s.temperature) }}
                    >
                      {num(s.temperature, 1)}°
                    </span>
                  ) : (
                    <span className="text-[var(--ink-2)]">—</span>
                  )}
                  {s.humidity != null && <span className="tnum">{int(s.humidity)} %</span>}
                  {s.windDirection != null && <span>{windCardinal(s.windDirection)}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <p className="source mt-1.5!">
            {stations.length === 1 ? 'Estació meteorològica de l’estació' : `${stations.length} estacions meteorològiques de l’estació`}
            {' · '}{ago(Math.min(...stations.map((s) => s.ageMin)))}
          </p>
        </div>
      )}

      {/* El que es veu ara mateix, que és el que la gent ve a mirar. */}
      {cameras.length > 0 && (
        <div className="mt-4">
          <ul className="grid list-none grid-cols-2 gap-2 p-0">
            {cameras.slice(0, 2).map((c) => (
              <li key={c.id} className="min-w-0">
                <Link href={`/cameres/${c.slug}`} className="block no-underline">
                  <img
                    src={cameraImage(c, 'thumb')}
                    width={400}
                    height={225}
                    loading="lazy"
                    decoding="async"
                    alt={`Fotograma de la càmera ${c.name}, a ${resort.name}`}
                    className="block aspect-video h-auto w-full rounded-[12px] bg-[var(--surface-2)] object-cover"
                  />
                  <span className="mt-1 block truncate text-[12px] text-[var(--ink-2)]">
                    {[c.name, c.altitudM != null && `${int(c.altitudM)} m`]
                      .filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="source mt-1!">
            {cameras.length === 1
              ? `Càmera de l’estació · ${ago(cameras[0].ageMin)}`
              : `${cameras.length} càmeres de l’estació · la més recent, ${ago(Math.min(...cameras.map((c) => c.ageMin)))}`}
            {cameras.length > 2 && (
              <>
                {' · '}
                <Link href="/cameres" className="text-[var(--accent)] no-underline hover:underline">totes</Link>
              </>
            )}
          </p>
        </div>
      )}

      {/*
        Els itineraris d'esquí de muntanya, plegats.
        Son com a molt cinc per estacio, aixi que caben; i van dins d'un
        `details` perque qui ve a mirar la neu no els ha de tenir al davant.
      */}
      {resort.skiTouring.length > 0 && (
        <details className="mt-4 border-t border-[var(--line-soft)] pt-3">
          <summary className="cursor-pointer text-[13px] font-medium text-[var(--ink-2)]">
            {resort.skiTouring.length === 1
              ? 'Un itinerari d’esquí de muntanya'
              : `${int(resort.skiTouring.length)} itineraris d’esquí de muntanya`}
          </summary>
          <ul className="rows mt-2 text-[13px]">
            {resort.skiTouring.map((r) => (
              <li key={r.name} className="flex-wrap gap-y-0.5! py-2!">
                <span className="text-[var(--ink)]">
                  {r.name}
                  {r.difficulty && (
                    <span className="ml-1.5 text-[var(--muted)]">{r.difficulty.toLowerCase()}</span>
                  )}
                </span>
                <span className="tnum text-[12px] text-[var(--muted)]">
                  {[
                    r.lengthM != null && `${num(r.lengthM / 1000, 1)} km`,
                    r.ascentM != null && `+${int(r.ascentM)} m`,
                    r.minM != null && r.maxM != null && `${int(r.minM)}–${int(r.maxM)} m`,
                  ].filter(Boolean).join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* La cota de neu prevista contra el desnivell. Només a les fitxes, on ja
          hi ha la predicció pagada. */}
      {snowShare != null && (
        <p className="mt-4 border-t border-[var(--line-soft)] pt-3 text-[13.5px] leading-relaxed text-[var(--ink-2)]">
          {snowShare === 0
            ? 'Amb la cota de neu prevista, la precipitació arribaria en forma de pluja a tot el desnivell esquiable.'
            : snowShare === 100
              ? 'Amb la cota de neu prevista, la precipitació arribaria en forma de neu a tot el desnivell esquiable.'
              : `Amb la cota de neu prevista, nevaria al ${snowShare} % de dalt del desnivell esquiable i plouria a la resta.`}
        </p>
      )}

      {resort.nearest && distKm == null && (
        <p className="mt-auto pt-3 text-[13px] text-[var(--muted)]">
          El poble més proper amb fitxa és{' '}
          <Link href={resort.nearest.path} className="text-[var(--accent)] no-underline hover:underline">
            {resort.nearest.nom}
          </Link>
          , a {num(resort.nearest.distKm, 0)} km.
        </p>
      )}
    </div>
  );
}
