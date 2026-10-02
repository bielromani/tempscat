import { WeatherIcon } from './WeatherIcon';
import { rainWarnedAt, warnedIconLabel, type RainWarning } from '@/lib/narrative';
import type { DailyPoint, HourlyPoint } from '@/lib/forecast-types';

/**
 * Les pròximes 24 hores, en una tira: l'hora, la icona, la temperatura i la
 * probabilitat de pluja quan val la pena dir-la.
 *
 * Substitueix les pestanyes de temperatura, pluja i vent del redisseny
 * anterior. Tres pestanyes per a una sola pregunta —«què farà d'aquí a una
 * estona?»— feien triar abans de mirar; el vent i els mil·límetres hora a hora
 * són al gràfic i a la taula de 48 hores, plegats més avall.
 *
 * La sortida i la posta del sol entren a la tira com una columna més, a
 * l'hora que toca: és el que separa «les 20 h» del dia de «les 20 h» de nit,
 * i la icona sola no ho diu prou.
 *
 * `nowHour` arriba de la capa de dades: aquí no es llegeix el rellotge.
 */

/** Un instant → l'hora local de Madrid, `AAAA-MM-DDTHH`, i `HH:MM` per escriure-la. */
function madrid(iso: string): { key: string; hm: string } {
  const s = new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T');
  return { key: s.slice(0, 13), hm: s.slice(11, 16) };
}

type Item =
  | { kind: 'hour'; h: HourlyPoint; first: boolean }
  | { kind: 'sunrise' | 'sunset'; hm: string };

export function HourStrip({
  hourly, daily, nowHour, hours = 24, rainWarnings = [],
}: {
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  nowHour: string;
  hours?: number;
  /** Amb avís, la icona no diu «feble»: vegeu `warnedIconLabel()`. */
  rainWarnings?: RainWarning[];
}) {
  const from = Math.max(0, hourly.findIndex((h) => h.time.slice(0, 13) === nowHour));
  const slice = hourly.slice(from, from + hours);

  const events = daily.flatMap((d) => [
    d.sunrise ? { kind: 'sunrise' as const, ...madrid(d.sunrise) } : null,
    d.sunset ? { kind: 'sunset' as const, ...madrid(d.sunset) } : null,
  ]).filter((e): e is { kind: 'sunrise' | 'sunset'; key: string; hm: string } => e != null);

  const items: Item[] = [];
  slice.forEach((h, i) => {
    items.push({ kind: 'hour', h, first: i === 0 });
    // Un esdeveniment a les 19:36 va darrere de la columna de les 19 h.
    for (const e of events) if (e.key === h.time.slice(0, 13) && i > 0) items.push({ kind: e.kind, hm: e.hm });
  });

  return (
    <ol className="hour-strip scroll-x" aria-label="Pròximes hores">
      {items.map((it) => {
        if (it.kind === 'hour') {
          const { h } = it;
          const p = h.precipProbability ?? 0;
          return (
            <li key={h.time}>
              <span className="hs-time tnum">{it.first ? 'Ara' : h.time.slice(11, 13)}</span>
              <WeatherIcon
                code={h.weatherCode}
                isDay={h.isDay}
                size={36}
                label={warnedIconLabel(h.weatherCode, rainWarnedAt(rainWarnings, h.time))}
              />
              <span className="hs-temp tnum">{h.temperature != null ? `${Math.round(h.temperature)}°` : '—'}</span>
              <span className="hs-prob tnum">{p >= 20 ? `${p} %` : ''}</span>
            </li>
          );
        }
        return (
          <li key={`${it.kind}${it.hm}`} className="hs-sun">
            <span className="hs-time tnum">{it.hm}</span>
            {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
            <img src={`/icons/w/${it.kind}.svg`} width={36} height={36} alt="" />
            <span className="hs-temp">{it.kind === 'sunrise' ? 'Surt' : 'Es pon'}</span>
            <span className="hs-prob" />
          </li>
        );
      })}
    </ol>
  );
}
