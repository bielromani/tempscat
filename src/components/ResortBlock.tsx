import Link from 'next/link';
import { ago, dateFull, deWord, int, num, temp } from '@/lib/format';
import { windCardinal } from '@/lib/variables';
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
 * ## Dels itineraris se'n compten quatre menes i se'n descriu una
 *
 * Els d'esquí de muntanya porten dificultat, longitud, desnivell i les dues
 * cotes, tots vint-i-dos: aquests van desplegats. Dels de senderisme, raquetes
 * i fora de pista només se'n diu quants n'hi ha, perquè de 65 només 9 porten
 * cota i una taula amb els forats tapats seria una taula inventada.
 */
export function ResortBlock({
  resort, stations, snowShare, distKm,
}: {
  resort: ResortNow;
  stations: StationNow[];
  /** Part del desnivell per damunt de la cota de neu prevista. Només a les fitxes. */
  snowShare?: number | null;
  distKm?: number;
}) {
  const { slopes, lifts } = resort;
  const hasSnow = resort.reportUsable && resort.snowMaxCm != null && resort.snowMaxCm > 0;

  return (
    <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold tracking-tight text-[var(--ink)]">
          {resort.name}
        </h3>
        <span
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
          style={{
            background: resort.open ? 'var(--good)' : 'var(--surface-2)',
            color: resort.open ? 'var(--surface)' : 'var(--muted)',
          }}
        >
          {resort.openLabel}
        </span>
      </div>

      {/* El catàleg tècnic: no depèn de cap comunicat. */}
      {(slopes || lifts) && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          {[
            slopes?.minM != null && slopes.maxM != null && `${int(slopes.minM)}–${int(slopes.maxM)} m`,
            slopes && `${int(slopes.count)} ${slopes.count === 1 ? 'pista' : 'pistes'}`,
            slopes?.km != null && `${num(slopes.km, 1)} km`,
            lifts && `${int(lifts.count)} ${lifts.count === 1 ? 'remuntador' : 'remuntadors'}`,
            distKm != null && `a ${num(distKm, 0)} km`,
          ].filter(Boolean).join(' · ')}
        </p>
      )}

      {resort.circuits.length > 0 && (
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          Itineraris: {resort.circuits.map((c) => `${int(c.count)} ${deWord(c.kind)}`).join(' · ')}
        </p>
      )}

      {/* El comunicat, mentre val. */}
      {resort.reportUsable ? (
        <>
          {hasSnow && (
            <p className="mt-2.5 flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="tnum text-2xl font-semibold text-[var(--ink)]">
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
            <p className="mt-1 text-xs text-[var(--muted)]">
              Última nevada: {resort.lastSnowfall}
              {resort.lastSnowfallCm != null && `, ${int(resort.lastSnowfallCm)} cm`}
            </p>
          )}

          <p className="mt-2 text-xs text-[var(--ink-2)]">
            {[
              resort.slopesOpenPct != null && `pistes obertes ${int(resort.slopesOpenPct)} %`,
              resort.liftsOpenPct != null && `remuntadors ${int(resort.liftsOpenPct)} %`,
              resort.sky && resort.sky.toLowerCase(),
              resort.visibility && `visibilitat ${resort.visibility.toLowerCase()}`,
            ].filter(Boolean).join(' · ')}
          </p>

          <p className="mt-1 text-[11px] text-[var(--muted)]">
            Comunicat de l&apos;estació · {ago(resort.ageHours * 60)}
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs text-[var(--muted)]">
          L&apos;últim comunicat de l&apos;estació és del {dateFull(resort.reportAt)}. No se
          n&apos;ensenya el gruix de neu ni les pistes obertes passades{' '}
          {REPORT_SHOW_HOURS} hores.
        </p>
      )}

      {/* Les estacions meteorològiques, que no s'aturen mai. */}
      {stations.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[var(--line-soft)] pt-3 text-sm sm:grid-cols-3">
          {stations.map((s) => (
            <div key={s.id}>
              <dt className="text-[11px] text-[var(--muted)]">
                {s.altitudM != null ? `${int(s.altitudM)} m` : s.name}
              </dt>
              <dd className="tnum font-medium text-[var(--ink)]">
                {temp(s.temperature)}
                {s.humidity != null && (
                  <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">
                    {int(s.humidity)} %
                  </span>
                )}
                {s.windDirection != null && (
                  <span className="ml-1.5 text-[11px] font-normal text-[var(--muted)]">
                    {windCardinal(s.windDirection)}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {stations.length > 0 && (
        <p className="mt-1.5 text-[11px] text-[var(--muted)]">
          {stations.length === 1 ? 'Estació meteorològica de l’estació' : `${stations.length} estacions meteorològiques de l’estació`}
          {' · '}{ago(Math.min(...stations.map((s) => s.ageMin)))}
        </p>
      )}

      {/*
        Els itineraris d'esquí de muntanya, plegats.
        Son com a molt cinc per estacio, aixi que caben; i van dins d'un
        `details` perque qui ve a mirar la neu no els ha de tenir al davant.
      */}
      {resort.skiTouring.length > 0 && (
        <details className="mt-3 border-t border-[var(--line-soft)] pt-2">
          <summary className="cursor-pointer text-xs font-medium text-[var(--ink-2)]">
            {resort.skiTouring.length === 1
              ? 'Un itinerari d’esquí de muntanya'
              : `${int(resort.skiTouring.length)} itineraris d’esquí de muntanya`}
          </summary>
          <ul className="mt-2 list-none space-y-1.5 p-0">
            {resort.skiTouring.map((r) => (
              <li key={r.name} className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                <span className="text-[var(--ink)]">
                  {r.name}
                  {r.difficulty && (
                    <span className="ml-1.5 text-[var(--muted)]">{r.difficulty.toLowerCase()}</span>
                  )}
                </span>
                <span className="tnum text-[var(--muted)]">
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
        <p className="mt-2 border-t border-[var(--line-soft)] pt-2 text-xs leading-relaxed text-[var(--ink-2)]">
          {snowShare === 0
            ? 'Amb la cota de neu prevista, la precipitació arribaria en forma de pluja a tot el desnivell esquiable.'
            : snowShare === 100
              ? 'Amb la cota de neu prevista, la precipitació arribaria en forma de neu a tot el desnivell esquiable.'
              : `Amb la cota de neu prevista, nevaria al ${snowShare} % de dalt del desnivell esquiable i plouria a la resta.`}
        </p>
      )}

      {resort.nearest && distKm == null && (
        <p className="mt-2 text-[11px] text-[var(--muted)]">
          El poble més proper amb fitxa és{' '}
          <Link href={resort.nearest.path} className="text-[var(--ink-2)]">{resort.nearest.nom}</Link>
          , a {num(resort.nearest.distKm, 0)} km.
        </p>
      )}
    </div>
  );
}
