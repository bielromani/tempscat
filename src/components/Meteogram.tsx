import { temperatureColor } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import { weatherCode } from '@/lib/weather-codes';
import { weatherSpriteHref } from './WeatherIcon';
import { hour, num, relativeDay } from '@/lib/format';
import type { HourlyPoint } from '@/lib/weather';

/**
 * Meteograma de 48 horas, renderizado como SVG **en el servidor**.
 *
 * Es el componente que más importa del sitio y por eso no lleva JavaScript:
 *
 *  · El crawler ve los valores dentro del marcado, no un canvas vacío.
 *  · No hay salto de layout: el viewBox fija la relación de aspecto.
 *  · No entra en el bundle, así que no penaliza el LCP de 4.293 páginas.
 *
 * ## Segunda versión: qué le faltaba a la primera
 *
 * La primera dibujaba los datos correctamente y aun así no se entendía, que es
 * el peor sitio donde puede estar un gráfico. Los cinco arreglos, por orden de
 * cuánto cambian la lectura:
 *
 *  1. **No decía qué era cada franja.** Tres bandas apiladas sin etiquetas
 *     obligan a deducir que la de abajo es viento. Ahora cada banda tiene su
 *     rótulo dentro del gráfico y su unidad.
 *
 *  2. **No había iconos.** Una línea de temperatura no dice si está nublado. Con
 *     una fila de iconos cada tres horas, la pregunta «¿lloverá esta tarde?» se
 *     responde sin leer un número.
 *
 *  3. **No se veía dónde estamos.** Sin marca de la hora actual, la mitad
 *     izquierda del gráfico es pasado que ya no interesa. Ahora hay una línea de
 *     «ara» y lo anterior va atenuado.
 *
 *  4. **Las horas eran ambiguas.** El eje decía 00:00, 06:00, 12:00 sin decir de
 *     qué día, y las cabeceras de día iban debajo, separadas de su columna.
 *     Ahora el día va arriba, centrado sobre sus horas, y dice «avui» y «demà».
 *
 *  5. **Una probabilidad del 60 % con 0,2 mm era invisible.** La cantidad y la
 *     probabilidad son dos preguntas distintas —cuánto y si— y ahora se ven las
 *     dos: la sombra de fondo es la probabilidad, la barra sólida los milímetros.
 */

interface Props {
  hourly: HourlyPoint[];
  hours?: number;
  /** Franja de incertidumbre entre modelos. Solo si hay más de uno. */
  showSpread?: boolean;
  /** Hora en curso (2026-08-31T14) para marcar el «ara». */
  nowHour?: string | null;
  /**
   * `id` del radio de la pestaña que enseña estas mismas horas en tabla.
   *
   * Es la alternativa en texto del gráfico. Se señala en vez de duplicarse
   * — ver el bloque del final del componente.
   */
  tableFor?: string;
}

const W = 1000;
const H = 348;

const PAD = { left: 46, right: 54 };
const DAY_Y = 14;           // rótulos de día
const ICON_Y = 24;          // fila de iconos
const ICON = 22;
const TEMP_TOP = 56;
const TEMP_H = 150;
const PRECIP_H = 58;
const WIND_Y = 300;
const HOUR_Y = 334;

const PLOT_W = W - PAD.left - PAD.right;
const TEMP_BOTTOM = TEMP_TOP + TEMP_H;
const PRECIP_BASE = TEMP_BOTTOM + PRECIP_H;

const RAIN = 'oklch(52% 0.13 245)';

export function Meteogram({
  hourly, hours = 48, showSpread = true, nowHour = null, tableFor,
}: Props) {
  const data = hourly.slice(0, hours);
  if (data.length < 2) return null;

  const temps = data.map((d) => d.temperature).filter((v): v is number => v != null);
  if (!temps.length) return null;

  // Márgenes redondeados a grados enteros: un eje que empieza en 13,7 °C se lee
  // peor y no aporta nada.
  const tMin = Math.floor(Math.min(...temps) - 1);
  const tMax = Math.ceil(Math.max(...temps) + 1);
  const tRange = Math.max(1, tMax - tMin);

  const maxPrecip = Math.max(1, ...data.map((d) => d.precipitation ?? 0));
  const anyRain = data.some((d) => (d.precipitation ?? 0) >= 0.1);

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * PLOT_W;
  const yTemp = (t: number) => TEMP_TOP + TEMP_H - ((t - tMin) / tRange) * TEMP_H;
  const step = PLOT_W / (data.length - 1);

  const today = data[0].time.slice(0, 10);
  const nowIdx = nowHour ? data.findIndex((d) => d.time.slice(0, 13) === nowHour) : -1;

  // ── Bandas nocturnas ──────────────────────────────────────────────────────
  // Se derivan de isDay, que ya viene calculado con el orto y el ocaso reales de
  // esta ubicación. La versión anterior usaba «de 21 h a 7 h» fijo, y en un
  // pueblo del Pirineo en diciembre eso pintaba de día dos horas de noche.
  const nightBands: Array<{ x0: number; x1: number }> = [];
  let nightStart: number | null = null;
  data.forEach((d, i) => {
    if (!d.isDay && nightStart === null) nightStart = i;
    if (d.isDay && nightStart !== null) {
      nightBands.push({ x0: x(nightStart), x1: x(i) });
      nightStart = null;
    }
  });
  if (nightStart !== null) nightBands.push({ x0: x(nightStart), x1: x(data.length - 1) });

  // ── Días ──────────────────────────────────────────────────────────────────
  const days: Array<{ day: string; from: number; to: number }> = [];
  data.forEach((d, i) => {
    const day = d.time.slice(0, 10);
    const last = days[days.length - 1];
    if (!last || last.day !== day) days.push({ day, from: i, to: i });
    else last.to = i;
  });

  const tempPath = data
    .map((d, i) => (d.temperature == null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yTemp(d.temperature).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');

  const areaPath = `${tempPath} L${x(data.length - 1).toFixed(1)},${TEMP_BOTTOM} L${x(0).toFixed(1)},${TEMP_BOTTOM} Z`;

  const spreadPath = showSpread && data.some((d) => d.spread != null)
    ? [
      ...data.map((d, i) => (d.temperature == null ? '' : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yTemp(d.temperature + (d.spread ?? 0)).toFixed(1)}`)),
      ...data.slice().reverse().map((d, j) => {
        const i = data.length - 1 - j;
        return d.temperature == null ? '' : `L${x(i).toFixed(1)},${yTemp(d.temperature - (d.spread ?? 0)).toFixed(1)}`;
      }),
      'Z',
    ].join(' ')
    : null;

  const gridTemps: number[] = [];
  const gridStep = tRange > 24 ? 10 : tRange > 12 ? 5 : 2;
  for (let t = Math.ceil(tMin / gridStep) * gridStep; t <= tMax; t += gridStep) gridTemps.push(t);

  /** Extremos de cada día, para anotarlos con su cifra. */
  const extremes = days.flatMap(({ from, to }) => {
    const slice = data.slice(from, to + 1)
      .map((d, k) => ({ d, i: from + k }))
      .filter((p): p is { d: HourlyPoint & { temperature: number }; i: number } => p.d.temperature != null);
    if (slice.length < 4) return [];
    const hi = slice.reduce((a, b) => (b.d.temperature > a.d.temperature ? b : a));
    const lo = slice.reduce((a, b) => (b.d.temperature < a.d.temperature ? b : a));
    return [{ ...hi, kind: 'max' as const }, { ...lo, kind: 'min' as const }];
  });

  const describe = `Temperatura de ${tMin} a ${tMax} °C, precipitació i vent per a les pròximes ${data.length} hores.`;

  return (
    <figure className="m-0">
      <div className="scroll-x">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={describe}
          style={{ minWidth: 700, display: 'block' }}
        >
          <title>{describe}</title>

          <defs>
            <linearGradient id="tempGradient" x1="0" y1="0" x2="1" y2="0">
              {data.map((d, i) => (d.temperature == null ? null : (
                <stop key={`s${i}`} offset={`${(i / (data.length - 1)) * 100}%`} stopColor={temperatureColor(d.temperature)} />
              )))}
            </linearGradient>
          </defs>

          {/* Noche */}
          {nightBands.map((b, i) => (
            <rect
              key={`n${i}`} x={b.x0} y={TEMP_TOP} width={b.x1 - b.x0} height={TEMP_H + PRECIP_H}
              fill="var(--ink)" opacity={0.05}
            />
          ))}

          {/* Pasado atenuado: lo que ya ha ocurrido no es lo que se viene a
              consultar, y quitarle contraste hace que la vista vaya a la derecha. */}
          {nowIdx > 0 && (
            <rect
              x={PAD.left} y={TEMP_TOP} width={x(nowIdx) - PAD.left} height={TEMP_H + PRECIP_H}
              fill="var(--surface-2)" opacity={0.75}
            />
          )}

          {/* Separadores y rótulos de día */}
          {days.map(({ day, from, to }, k) => {
            const x0 = k === 0 ? PAD.left : x(from) - step / 2;
            const x1 = to === data.length - 1 ? W - PAD.right : x(to) + step / 2;
            return (
              <g key={day}>
                {k > 0 && (
                  <line x1={x0} x2={x0} y1={DAY_Y - 8} y2={PRECIP_BASE} stroke="var(--line)" strokeWidth={1} />
                )}
                <text
                  x={(x0 + x1) / 2} y={DAY_Y} textAnchor="middle"
                  fontSize={12} fontWeight={600} fill="var(--ink-2)"
                >
                  {relativeDay(day, today)}
                  <tspan fill="var(--muted)" fontWeight={400}> {Number(day.slice(8, 10))}</tspan>
                </text>
              </g>
            );
          })}

          {/* Iconos de cielo cada 3 h */}
          {data.map((d, i) => {
            if (i % 3 !== 1 || d.weatherCode == null) return null;
            return (
              <use
                key={`i${i}`}
                href={weatherSpriteHref(d.weatherCode, d.isDay)}
                x={x(i) - ICON / 2} y={ICON_Y} width={ICON} height={ICON}
                opacity={nowIdx > i ? 0.45 : 1}
              >
                <title>{`${hour(d.time)} · ${weatherCode(d.weatherCode).caLong}`}</title>
              </use>
            );
          })}

          {/* Rejilla y eje de temperatura */}
          {gridTemps.map((t) => (
            <g key={`g${t}`}>
              <line
                x1={PAD.left} x2={W - PAD.right} y1={yTemp(t)} y2={yTemp(t)}
                stroke="var(--line)" strokeWidth={1} strokeDasharray="2 4"
              />
              <text
                x={PAD.left - 8} y={yTemp(t) + 4} textAnchor="end"
                fontSize={11} fill="var(--muted)" className="tnum"
              >{t}°</text>
            </g>
          ))}

          {spreadPath && (
            <path d={spreadPath} fill="var(--accent)" opacity={0.13}>
              <title>Marge de desacord entre models</title>
            </path>
          )}

          <path d={areaPath} fill="url(#tempGradient)" opacity={0.22} />
          <path d={tempPath} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* Máxima y mínima de cada día, con su cifra. Es el dato que la gente
              busca en un meteograma y hasta ahora había que estimarlo a ojo
              contra la rejilla. */}
          {extremes.map(({ d, i, kind }) => {
            const y = yTemp(d.temperature);
            const above = kind === 'max';
            return (
              <g key={`e${kind}${i}`}>
                <circle cx={x(i)} cy={y} r={2.6} fill="var(--ink)" />
                <text
                  x={x(i)} y={above ? y - 8 : y + 15} textAnchor="middle"
                  fontSize={11} fontWeight={600} fill="var(--ink)"
                  stroke="var(--surface)" strokeWidth={3} paintOrder="stroke"
                  className="tnum"
                >{Math.round(d.temperature)}°</text>
              </g>
            );
          })}

          {/* ── Precipitación ─────────────────────────────────────────────── */}
          {/* Probabilidad de fondo. Va detrás y translúcida: contesta «¿es
              probable?» sin competir con «¿cuánto?», que es la barra sólida. */}
          {data.map((d, i) => {
            const p = d.precipProbability ?? 0;
            if (p < 10) return null;
            const h = (p / 100) * (PRECIP_H - 6);
            return (
              <rect
                key={`pp${i}`}
                x={x(i) - step / 2} y={PRECIP_BASE - h}
                width={Math.max(1, step)} height={h}
                fill={RAIN} opacity={0.14}
              />
            );
          })}

          {data.map((d, i) => {
            const mm = d.precipitation ?? 0;
            if (mm < 0.1) return null;
            const h = Math.max(2, (mm / maxPrecip) * (PRECIP_H - 8));
            return (
              <rect
                key={`p${i}`}
                x={x(i) - step * 0.35} y={PRECIP_BASE - h}
                width={Math.max(1.5, step * 0.7)} height={h}
                fill={RAIN} rx={1}
              >
                <title>
                  {`${hour(d.time)} · ${num(mm, 1)} mm${d.precipProbability != null ? ` · ${d.precipProbability} % de probabilitat` : ''}`}
                </title>
              </rect>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={PRECIP_BASE} y2={PRECIP_BASE} stroke="var(--line)" strokeWidth={1} />

          {/* Techo de la banda de lluvia. Solo si hay lluvia: con la serie a cero,
              maxPrecip vale 1 por el mínimo del cálculo, y rotular «1,0 mm» en un
              día seco insinúa una lluvia que ningún modelo ha previsto. */}
          {anyRain && (
            <text x={W - PAD.right + 6} y={PRECIP_BASE - PRECIP_H + 12} fontSize={10} fill={RAIN} className="tnum">
              {num(maxPrecip, 1)} mm
            </text>
          )}
          <text x={W - PAD.right + 6} y={PRECIP_BASE - 2} fontSize={10} fill="var(--muted)">0</text>

          {/* ── Viento ────────────────────────────────────────────────────── */}
          {data.map((d, i) => {
            if (i % 3 !== 1 || d.windDirection == null || d.windSpeed == null) return null;
            const kmh = msToKmh(d.windSpeed);
            const size = 4.5 + Math.min(4, kmh / 18);
            return (
              <g key={`w${i}`}>
                <g transform={`translate(${x(i).toFixed(1)},${WIND_Y}) rotate(${d.windDirection})`}>
                  {/* La flecha apunta hacia donde va el viento, que es la
                      convención de los mapas de superficie. La dirección
                      meteorológica es de dónde viene, de ahí el giro. */}
                  <path
                    d={`M0,${-size} L${size * 0.6},${size * 0.7} L0,${size * 0.25} L${-size * 0.6},${size * 0.7} Z`}
                    fill={kmh >= 40 ? 'var(--bad)' : 'var(--ink-2)'}
                    opacity={kmh < 5 ? 0.3 : 0.85}
                  >
                    <title>{`${hour(d.time)} · ${kmh.toFixed(0)} km/h del ${windCardinal(d.windDirection)}`}</title>
                  </path>
                </g>
                {i % 6 === 1 && (
                  <text
                    x={x(i)} y={WIND_Y + 20} textAnchor="middle" fontSize={10}
                    fill={kmh >= 40 ? 'var(--bad)' : 'var(--muted)'} className="tnum"
                  >{kmh.toFixed(0)}</text>
                )}
              </g>
            );
          })}

          {/* ── Eje de horas ──────────────────────────────────────────────── */}
          {data.map((d, i) => {
            if (i % 3 !== 0) return null;
            return (
              <g key={`h${i}`}>
                <line x1={x(i)} x2={x(i)} y1={PRECIP_BASE} y2={PRECIP_BASE + 4} stroke="var(--line)" strokeWidth={1} />
                <text
                  x={x(i)} y={HOUR_Y} fontSize={10} fill="var(--muted)"
                  textAnchor="middle" className="tnum"
                >{hour(d.time).slice(0, 2)}</text>
              </g>
            );
          })}
          <text x={W - PAD.right + 6} y={HOUR_Y} fontSize={10} fill="var(--muted)">h</text>

          {/* ── Rótulos de banda, dentro del gráfico ──────────────────────── */}
          <text x={PAD.left - 8} y={TEMP_TOP - 6} textAnchor="end" fontSize={10} fill="var(--muted)">°C</text>
          <text x={PAD.left - 8} y={PRECIP_BASE - PRECIP_H / 2} textAnchor="end" fontSize={10} fill={RAIN}>
            mm
          </text>
          <text x={PAD.left - 8} y={WIND_Y + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
            vent
          </text>

          {/* ── Ahora ─────────────────────────────────────────────────────── */}
          {nowIdx >= 0 && (
            <g>
              <line
                x1={x(nowIdx)} x2={x(nowIdx)} y1={TEMP_TOP - 10} y2={PRECIP_BASE}
                stroke="var(--accent)" strokeWidth={1.5}
              />
              {/*
                La etiqueta va en la franja vacía que queda entre la línea base
                de la lluvia y las flechas de viento.
                Arriba, dentro de la banda de temperatura, chocaba con la cifra
                de la máxima justo los días en que la máxima cae a esta hora —
                que son la mitad de las tardes.
              */}
              <text
                x={x(nowIdx) + 5} y={PRECIP_BASE + 13}
                fontSize={10} fontWeight={600} fill="var(--accent)"
                stroke="var(--surface)" strokeWidth={3} paintOrder="stroke"
              >ara</text>
            </g>
          )}
        </svg>
      </div>

      {/* Leyenda en HTML, no en el SVG: se ajusta al ancho del móvil sin que
          haya que escalar el gráfico entero para que quepa el texto. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] leading-tight text-[var(--muted)]">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: 'var(--ink)' }} />
          temperatura
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2 rounded-sm" style={{ background: RAIN }} />
          pluja en mm
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2 rounded-sm" style={{ background: RAIN, opacity: 0.2 }} />
          probabilitat
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden>▲</span> direcció i força del vent
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-3 rounded-sm" style={{ background: 'var(--ink)', opacity: 0.08 }} />
          nit
        </li>
        {showSpread && data.some((d) => d.spread != null) && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-3 rounded-sm" style={{ background: 'var(--accent)', opacity: 0.2 }} />
            desacord entre models
          </li>
        )}
      </ul>

      {/*
        * La alternativa en texto del gráfico, que un gráfico necesita.
        *
        * Aquí había una tabla equivalente dentro de un `<details>`. Cuando el
        * gráfico y la tabla horaria pasaron a ser dos pestañas del mismo bloque,
        * esa tabla se convirtió en la **tercera** copia de las mismas 48 horas
        * en la misma página.
        *
        * Así que la alternativa ya no se duplica: se señala. `tableFor` es el
        * identificador del radio de la pestaña de al lado, y esta etiqueta la
        * enciende — el mismo mecanismo, sin JavaScript y sin repetir un solo
        * número.
        *
        * Sin `tableFor` —si alguna vez se usa el gráfico solo— no se enseña
        * nada, porque prometer una tabla que no existe es peor que no
        * prometerla.
        */}
      {tableFor && (
        <p className="mt-3 text-sm">
          <label
            htmlFor={tableFor}
            className="cursor-pointer text-[var(--muted)] underline decoration-dotted hover:text-[var(--ink)]"
          >
            Les mateixes dades, hora per hora i en xifres
          </label>
        </p>
      )}
    </figure>
  );
}
