import { temperatureColor } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import type { HourlyPoint } from '@/lib/weather';

/**
 * Meteograma de 48 horas, renderizado como SVG **en el servidor**.
 *
 * Es el componente que más importa del sitio y por eso no lleva JavaScript:
 *
 *  · El crawler ve los valores dentro del marcado, no un `<canvas>` vacío.
 *  · No hay salto de layout: el `viewBox` fija la relación de aspecto.
 *  · No entra en el bundle, así que no penaliza el LCP de 4.293 páginas.
 *
 * La interacción básica la da el navegador: cada franja horaria lleva un
 * `<title>`, que produce tooltip nativo sin una línea de script.
 */

interface Props {
  hourly: HourlyPoint[];
  hours?: number;
  /** Franja de incertidumbre entre modelos. Solo si hay más de uno. */
  showSpread?: boolean;
}

const W = 960;
const H = 300;
const PAD = { top: 22, right: 46, bottom: 46, left: 46 };
const PLOT_W = W - PAD.left - PAD.right;
const TEMP_H = 168;
const PRECIP_H = 52;
const WIND_Y = PAD.top + TEMP_H + PRECIP_H + 16;

export function Meteogram({ hourly, hours = 48, showSpread = true }: Props) {
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

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * PLOT_W;
  const yTemp = (t: number) => PAD.top + TEMP_H - ((t - tMin) / tRange) * TEMP_H;
  const precipBase = PAD.top + TEMP_H + PRECIP_H;

  const step = PLOT_W / (data.length - 1);

  // Bandas nocturnas: de 21 h a 7 h. Ayudan a leer el ciclo diario de un
  // vistazo, que es la mitad de lo que se busca en un meteograma.
  const nightBands: Array<{ x0: number; x1: number }> = [];
  let nightStart: number | null = null;
  data.forEach((d, i) => {
    const hour = Number(d.time.slice(11, 13));
    const isNight = hour >= 21 || hour < 7;
    if (isNight && nightStart === null) nightStart = i;
    if (!isNight && nightStart !== null) {
      nightBands.push({ x0: x(nightStart), x1: x(i) });
      nightStart = null;
    }
  });
  if (nightStart !== null) nightBands.push({ x0: x(nightStart), x1: x(data.length - 1) });

  const tempPath = data
    .map((d, i) => (d.temperature == null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yTemp(d.temperature).toFixed(1)}`))
    .filter(Boolean)
    .join(' ');

  const areaPath = `${tempPath} L${x(data.length - 1).toFixed(1)},${(PAD.top + TEMP_H).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + TEMP_H).toFixed(1)} Z`;

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

  // Etiquetas de día: una por medianoche.
  const dayTicks = data
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.time.slice(11, 13) === '00');

  const gridTemps: number[] = [];
  const gridStep = tRange > 24 ? 10 : tRange > 12 ? 5 : 2;
  for (let t = Math.ceil(tMin / gridStep) * gridStep; t <= tMax; t += gridStep) gridTemps.push(t);

  const describe = `Temperatura entre ${tMin} i ${tMax} °C, precipitació i vent per a les pròximes ${data.length} hores.`;

  return (
    <figure className="m-0">
      <div className="scroll-x">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={describe}
          style={{ minWidth: 640, display: 'block' }}
        >
          <title>{describe}</title>

          {nightBands.map((b, i) => (
            <rect
              key={`n${i}`} x={b.x0} y={PAD.top} width={b.x1 - b.x0} height={TEMP_H + PRECIP_H}
              fill="var(--ink)" opacity={0.04}
            />
          ))}

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

          <defs>
            <linearGradient id="tempGradient" x1="0" y1="0" x2="1" y2="0">
              {data.map((d, i) => (d.temperature == null ? null : (
                <stop key={`s${i}`} offset={`${(i / (data.length - 1)) * 100}%`} stopColor={temperatureColor(d.temperature)} />
              )))}
            </linearGradient>
          </defs>

          {/* Precipitación: barras desde su propia línea base, con corte en 0.
              Cero milímetros no dibuja nada — mostrar una barra mínima haría
              creer que va a llover. */}
          {data.map((d, i) => {
            const mm = d.precipitation ?? 0;
            if (mm < 0.1) return null;
            const h = Math.max(2, (mm / maxPrecip) * (PRECIP_H - 8));
            return (
              <rect
                key={`p${i}`}
                x={x(i) - step * 0.35} y={precipBase - h}
                width={Math.max(1.5, step * 0.7)} height={h}
                fill="oklch(52% 0.13 245)" rx={1}
              >
                <title>{`${d.time.slice(11, 16)} · ${mm.toFixed(1)} mm${d.precipProbability != null ? ` · ${d.precipProbability} % dels models` : ''}`}</title>
              </rect>
            );
          })}
          <line x1={PAD.left} x2={W - PAD.right} y1={precipBase} y2={precipBase} stroke="var(--line)" strokeWidth={1} />
          {maxPrecip > 1 && (
            <text x={W - PAD.right + 6} y={precipBase - PRECIP_H + 14} fontSize={10} fill="var(--muted)" className="tnum">
              {maxPrecip.toFixed(1)} mm
            </text>
          )}

          {/* Viento: una flecha cada 3 h. Más densidad se convierte en ruido. */}
          {data.map((d, i) => {
            if (i % 3 !== 0 || d.windDirection == null || d.windSpeed == null) return null;
            const kmh = msToKmh(d.windSpeed);
            const size = 4 + Math.min(4, kmh / 18);
            return (
              <g key={`w${i}`} transform={`translate(${x(i).toFixed(1)},${WIND_Y}) rotate(${d.windDirection})`}>
                <path
                  d={`M0,${-size} L${size * 0.6},${size * 0.7} L0,${size * 0.25} L${-size * 0.6},${size * 0.7} Z`}
                  fill={kmh >= 40 ? 'var(--bad)' : 'var(--ink-2)'}
                  opacity={kmh < 5 ? 0.3 : 0.85}
                >
                  <title>{`${d.time.slice(11, 16)} · ${kmh.toFixed(0)} km/h del ${windCardinal(d.windDirection)}`}</title>
                </path>
              </g>
            );
          })}

          {dayTicks.map(({ d, i }) => (
            <g key={`d${i}`}>
              <line x1={x(i)} x2={x(i)} y1={PAD.top} y2={precipBase} stroke="var(--line)" strokeWidth={1} />
              <text x={x(i) + 5} y={H - 10} fontSize={11} fill="var(--ink-2)" fontWeight={600}>
                {new Date(`${d.time}:00`).toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric' })}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            if (i % 6 !== 0) return null;
            return (
              <text key={`h${i}`} x={x(i)} y={H - 26} fontSize={10} fill="var(--muted)" textAnchor="middle" className="tnum">
                {d.time.slice(11, 16)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Tabla equivalente: accesible con lector de pantalla, extraíble por el
          crawler y consultable por quien quiera el número exacto. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          Veure les dades en taula
        </summary>
        <div className="scroll-x mt-2">
          <table className="w-full text-sm tnum border-collapse">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                <th className="py-1 pr-4 font-semibold">Hora</th>
                <th className="py-1 pr-4 font-semibold">Temp.</th>
                <th className="py-1 pr-4 font-semibold">Precip.</th>
                <th className="py-1 pr-4 font-semibold">Vent</th>
              </tr>
            </thead>
            <tbody>
              {data.filter((_, i) => i % 3 === 0).map((d) => (
                <tr key={d.time} className="border-t border-[var(--line-soft)]">
                  <td className="py-1 pr-4">{d.time.slice(5, 16).replace('T', ' ')}</td>
                  <td className="py-1 pr-4">{d.temperature != null ? `${d.temperature.toFixed(1)} °C` : '—'}</td>
                  <td className="py-1 pr-4">{d.precipitation ? `${d.precipitation.toFixed(1)} mm` : '—'}</td>
                  <td className="py-1 pr-4">
                    {d.windSpeed != null ? `${msToKmh(d.windSpeed).toFixed(0)} km/h` : '—'}
                    {d.windDirection != null ? ` ${windCardinal(d.windDirection)}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
