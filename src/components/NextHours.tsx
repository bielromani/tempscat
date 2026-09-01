import { WeatherIcon } from '@/components/WeatherIcon';
import { hour, num } from '@/lib/format';
import { temperatureColor } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import type { HourlyPoint } from '@/lib/forecast-types';

/**
 * Les pròximes hores, una cosa cada vegada.
 *
 * ## Per què existeix, si ja hi ha el meteograma i la taula
 *
 * Perquè responen preguntes diferents. El meteograma serveix per veure
 * **relacions** —que la pluja arriba quan gira el vent— i la taula, per buscar
 * un valor concret. Cap dels dos respon d'un cop d'ull la pregunta que porta
 * aquí la major part de la gent: **què passarà d'aquí a tres hores.**
 *
 * Això és una tira de dotze hores amb una sola variable a la vegada, en gran.
 * Els altres dos es queden on són, més avall.
 *
 * ## Sense una línia de JavaScript
 *
 * Les pestanyes són tres radios amagats i tres panells, amb `:checked` fent la
 * feina. Van amb el teclat —són radios de veritat— i van amb el JavaScript
 * apagat, que a les 4.293 pàgines territorials és l'estat normal. Els estils
 * són a `globals.css`.
 *
 * ## I una cosa que els grans no ensenyen
 *
 * Quan hi ha més d'un model, la pestanya de temperatura marca **on no es posen
 * d'acord**. Un web que et dona 27 °C i prou t'amaga que els models diuen entre
 * 24 i 30; aquí, quan la forquilla passa de tres graus, es diu.
 */

/** Quantes hores. Dotze cobreixen el que queda de dia i la nit. */
const HOURS = 12;

/** A partir d'aquí la discrepància entre models mereix dir-se. */
const SPREAD_C = 3;

interface Props {
  hourly: HourlyPoint[];
  nowHour: string;
  /** Serveix per saber si té sentit parlar de desacord entre models. */
  models: number;
  /** Únic a la pàgina: els radios s'agrupen pel nom. */
  id?: string;
}

export function NextHours({ hourly, nowHour, models, id = 'ara' }: Props) {
  const start = Math.max(0, hourly.findIndex((h) => h.time.slice(0, 13) === nowHour));
  const hours = hourly.slice(start, start + HOURS);
  if (hours.length < 2) return null;

  const rain = hours.map((h) => h.precipitation ?? 0);
  const maxRain = Math.max(...rain, 1);
  const gusts = hours.map((h) => (h.windGust != null ? msToKmh(h.windGust) : 0));
  const maxGust = Math.max(...gusts, 10);
  const anyRain = rain.some((mm) => mm >= 0.1);

  return (
    <div className="tabs">
      <input type="radio" name={`t-${id}`} id={`t-${id}-1`} defaultChecked />
      <input type="radio" name={`t-${id}`} id={`t-${id}-2`} />
      <input type="radio" name={`t-${id}`} id={`t-${id}-3`} />

      <div className="tablist mb-3 flex gap-5 border-b border-[var(--line-soft)] text-sm">
        <label htmlFor={`t-${id}-1`} className="pb-2">Temperatura</label>
        <label htmlFor={`t-${id}-2`} className="pb-2">Pluja</label>
        <label htmlFor={`t-${id}-3`} className="pb-2">Vent</label>
      </div>

      {/* ── Temperatura ── */}
      <section className="panel scroll-x">
        <ol className="flex min-w-max gap-1">
          {hours.map((h, i) => (
            <li key={h.time} className="w-[68px] shrink-0 rounded-md px-1 py-2 text-center">
              <p className="text-[11px] text-[var(--muted)]">{i === 0 ? 'ara' : hour(h.time)}</p>
              <div className="my-1 flex justify-center">
                <WeatherIcon code={h.weatherCode} isDay={h.isDay} size={30} />
              </div>
              <p className="tnum text-lg font-semibold text-[var(--ink)]">
                {h.temperature != null ? `${Math.round(h.temperature)}°` : '—'}
              </p>
              {h.temperature != null && (
                <span
                  className="mx-auto mt-1 block h-1 w-8 rounded-full"
                  style={{ background: temperatureColor(h.temperature) }}
                />
              )}
              {models > 1 && h.spread != null && h.spread >= SPREAD_C && h.temperature != null && (
                <p className="tnum mt-1 text-[10px] leading-tight text-[var(--muted)]">
                  {Math.round(h.temperature - h.spread / 2)}–{Math.round(h.temperature + h.spread / 2)}°
                </p>
              )}
            </li>
          ))}
        </ol>
        {models > 1 && hours.some((h) => (h.spread ?? 0) >= SPREAD_C) && (
          <p className="mt-2 max-w-[62ch] text-xs leading-relaxed text-[var(--muted)]">
            Les hores amb dues xifres a sota són aquelles en què els{' '}
            {models} models no coincideixen: aquell és el marge entre el més fred
            i el més càlid.
          </p>
        )}
      </section>

      {/* ── Pluja ── */}
      <section className="panel scroll-x">
        <ol className="flex min-w-max items-end gap-1">
          {hours.map((h, i) => {
            const mm = h.precipitation ?? 0;
            const prob = h.precipProbability;
            return (
              <li key={h.time} className="w-[68px] shrink-0 px-1 text-center">
                <p className="tnum text-[11px] text-[var(--muted)]">
                  {prob != null ? `${prob} %` : ' '}
                </p>
                {/* La barra viu dins d'una caixa d'alçada fixa perquè totes
                    comparteixin base i es puguin comparar d'un cop d'ull. */}
                <div className="mx-auto my-1 flex h-16 w-6 items-end">
                  <span
                    className="w-full rounded-t"
                    style={{
                      height: mm >= 0.05 ? `${Math.max(6, (mm / maxRain) * 100)}%` : '2px',
                      background: mm >= 0.05 ? 'var(--accent)' : 'var(--line)',
                    }}
                  />
                </div>
                <p className="tnum text-sm font-medium text-[var(--ink)]">
                  {mm >= 0.05 ? num(mm, 1) : '—'}
                </p>
                <p className="text-[11px] text-[var(--muted)]">{i === 0 ? 'ara' : hour(h.time)}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 max-w-[62ch] text-xs leading-relaxed text-[var(--muted)]">
          {anyRain
            ? `A dalt, la probabilitat; a baix, els mil·límetres. Les dues coses no diuen el mateix: un 80 % amb 0,2 mm són quatre gotes segures, i un 30 % amb 8 mm és un xàfec poc probable però de veritat.`
            : 'Cap hora amb pluja prevista. A dalt hi ha la probabilitat igualment, perquè un 20 % no és un zero.'}
        </p>
      </section>

      {/* ── Vent ── */}
      <section className="panel scroll-x">
        <ol className="flex min-w-max gap-1">
          {hours.map((h, i) => {
            const kmh = h.windSpeed != null ? msToKmh(h.windSpeed) : null;
            const gust = h.windGust != null ? msToKmh(h.windGust) : null;
            return (
              <li key={h.time} className="w-[68px] shrink-0 px-1 py-2 text-center">
                <p className="text-[11px] text-[var(--muted)]">{i === 0 ? 'ara' : hour(h.time)}</p>
                {h.windDirection != null ? (
                  <div className="my-1 flex justify-center" title={`Ve del ${windCardinal(h.windDirection)}`}>
                    {/* La fletxa apunta cap on va el vent, no d'on ve: és el que
                        la gent llegeix sense pensar-hi. El cardinal de sota diu
                        l'origen, que és la convenció meteorològica. */}
                    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden
                      style={{ transform: `rotate(${h.windDirection}deg)` }}>
                      <path d="M12 3 L12 21 M12 21 L7 15 M12 21 L17 15"
                        fill="none" stroke="var(--ink-2)" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                ) : <div className="my-1 h-[22px]" />}
                <p className="tnum text-sm font-semibold text-[var(--ink)]">
                  {kmh != null ? Math.round(kmh) : '—'}
                </p>
                <p className="tnum text-[11px] text-[var(--muted)]">
                  {gust != null ? `ratxa ${Math.round(gust)}` : ' '}
                </p>
                {h.windDirection != null && (
                  <p className="text-[11px] text-[var(--muted)]">{windCardinal(h.windDirection)}</p>
                )}
                {gust != null && (
                  <span
                    className="mx-auto mt-1 block h-1 rounded-full bg-[var(--ink-2)]"
                    style={{ width: `${Math.max(8, (gust / maxGust) * 100)}%`, opacity: 0.5 }}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 max-w-[62ch] text-xs leading-relaxed text-[var(--muted)]">
          En km/h. La fletxa assenyala cap on bufa; la lletra de sota diu d&apos;on
          ve, que és com se&apos;n parla. La ratxa és el cop més fort de l&apos;hora, i
          és la que tomba una para-sol o un ciclista.
        </p>
      </section>
    </div>
  );
}
