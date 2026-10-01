import { Fragment } from 'react';
import { WeatherIcon } from './WeatherIcon';
import { temperatureColor } from '@/lib/scales';
import { num, relativeDayTiny, dateTiny } from '@/lib/format';
import type { DailyPoint } from '@/lib/forecast-types';

/**
 * Els catorze dies, en llista: el dia, la icona, la pluja, i la mínima i la
 * màxima damunt d'una barra.
 *
 * Eren catorze targetes en una tira horitzontal que al mòbil se n'ensenyaven
 * tres i la resta calia arrossegar-les. En llista es veuen tots d'una ullada,
 * i la barra fa el que no feien els números sols: totes comparteixen escala
 * —de la mínima més baixa a la màxima més alta de la quinzena—, així que un
 * dia fred es veu a l'esquerra i un de calorós a la dreta sense llegir res.
 *
 * La segona setmana va apagada i darrere d'una ratlla, i sense mil·límetres:
 * un model encerta força la setmana que ve i molt menys la següent, i a dotze
 * dies vista la quantitat és soroll. La probabilitat encara diu alguna cosa.
 */

/** A partir d'aquí la predicció és tendència. No és un número triat a ull: és on
 *  un model determinista comença a tenir poca traça. */
const CONFIDENT_DAYS = 7;

export function DailyList({ daily, today }: { daily: DailyPoint[]; today: string }) {
  const all = daily.flatMap((d) => [d.tMax, d.tMin]).filter((v): v is number => v != null);
  if (!all.length) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(1, hi - lo);

  return (
    <ol className="day-list">
      {daily.map((d, i) => {
        const trend = i >= CONFIDENT_DAYS;
        const left = d.tMin != null ? ((d.tMin - lo) / span) * 100 : 0;
        const width = d.tMin != null && d.tMax != null ? ((d.tMax - d.tMin) / span) * 100 : 0;
        const label = relativeDayTiny(d.date, today);
        return (
          <Fragment key={d.date}>
            {i === CONFIDENT_DAYS && (
              <li className="dl-sep" aria-hidden="true">Tendència, orientativa</li>
            )}
            <li className={trend ? 'dl-row is-trend' : 'dl-row'}>
              <span className="dl-day">
                <span className="capitalize">{label}</span>
                {/* La data només quan el dia no és «avui» ni «demà»: allà la
                    data no afegeix res i ocupa lloc. */}
                {i > 1 && <span className="dl-date tnum">{dateTiny(d.date)}</span>}
              </span>
              <WeatherIcon code={d.weatherCode} size={34} />
              <span className="dl-rain tnum">
                {d.precipProbability >= 20 && <span>{d.precipProbability} %</span>}
                {!trend && d.precipitation >= 0.5 && <small>{num(d.precipitation, 1)} mm</small>}
              </span>
              <span className="dl-min tnum">{d.tMin != null ? `${Math.round(d.tMin)}°` : '—'}</span>
              <span className="dl-bar" aria-hidden="true">
                <i
                  style={{
                    left: `${left}%`,
                    width: `${Math.max(width, 4)}%`,
                    background: d.tMin != null && d.tMax != null
                      ? `linear-gradient(90deg, ${temperatureColor(d.tMin)}, ${temperatureColor(d.tMax)})`
                      : 'var(--line)',
                  }}
                />
              </span>
              <span className="dl-max tnum">{d.tMax != null ? `${Math.round(d.tMax)}°` : '—'}</span>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
