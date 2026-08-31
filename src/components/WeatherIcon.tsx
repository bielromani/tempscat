import { weatherCode, type WeatherGroup } from '@/lib/weather-codes';

/**
 * Iconos de tiempo dibujados en SVG inline.
 *
 * Ni fuente de iconos ni sprites externos: son cuatro trazos y así entran en el
 * HTML del servidor, sin petición de red, sin bloqueo de renderizado y visibles
 * para el crawler.
 *
 * ## Por qué hay un sprite y no solo `<WeatherIcon>`
 *
 * La tabla hora a hora dibuja 48 iconos. Repitiendo el SVG completo cada vez, la
 * página de Montblanc pesaba **428 KB**: los iconos solos eran casi la mitad.
 * Con el sprite, cada icono de la tabla son 60 bytes (`<use href="#...">`) y el
 * dibujo va una sola vez.
 *
 * El día y la noche se distinguen porque a las tres de la madrugada un sol es
 * información falsa.
 */

const SUN = 'oklch(78% 0.15 75)';
const MOON = 'oklch(80% 0.05 250)';
const CLOUD = 'oklch(72% 0.02 250)';
const CLOUD_DARK = 'oklch(55% 0.02 250)';
const RAIN = 'oklch(58% 0.13 245)';
const SNOW = 'oklch(88% 0.03 235)';
const BOLT = 'oklch(75% 0.16 85)';

function Sun({ cx = 12, cy = 10, r = 5 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={SUN} />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4;
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * (r + 1.8)} y1={cy + Math.sin(a) * (r + 1.8)}
            x2={cx + Math.cos(a) * (r + 3.6)} y2={cy + Math.sin(a) * (r + 3.6)}
            stroke={SUN} strokeWidth={1.6} strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function Moon({ cx = 12, cy = 10, r = 5 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <path
      d={`M ${cx + r * 0.4} ${cy - r} a ${r} ${r} 0 1 0 ${r * 0.75} ${r * 1.55} a ${r * 0.82} ${r * 0.82} 0 1 1 ${-r * 0.75} ${-r * 1.55} Z`}
      fill={MOON}
    />
  );
}

function Cloud({ x = 0, y = 0, scale = 1, fill = CLOUD }: { x?: number; y?: number; scale?: number; fill?: string }) {
  return (
    <g transform={`translate(${x},${y}) scale(${scale})`}>
      <path d="M8 20 a5 5 0 0 1 0.4 -9.96 a6.5 6.5 0 0 1 12.4 -1.4 a4.6 4.6 0 0 1 -0.8 11.36 Z" fill={fill} />
    </g>
  );
}

function Drops({ n = 3, y = 21, color = RAIN }: { n?: number; y?: number; color?: string }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={8 + i * 4} y1={y} x2={6.6 + i * 4} y2={y + 4.2}
          stroke={color} strokeWidth={1.8} strokeLinecap="round" />
      ))}
    </g>
  );
}

function Flakes({ n = 3, y = 22 }: { n?: number; y?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <g key={i} transform={`translate(${8 + i * 4},${y})`}>
          <line x1={-1.7} y1={0} x2={1.7} y2={0} stroke={SNOW} strokeWidth={1.5} strokeLinecap="round" />
          <line x1={0} y1={-1.7} x2={0} y2={1.7} stroke={SNOW} strokeWidth={1.5} strokeLinecap="round" />
          <line x1={-1.2} y1={-1.2} x2={1.2} y2={1.2} stroke={SNOW} strokeWidth={1.3} strokeLinecap="round" />
          <line x1={-1.2} y1={1.2} x2={1.2} y2={-1.2} stroke={SNOW} strokeWidth={1.3} strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function Bolt() {
  return <path d="M14 19 l-4 6 h3 l-2 5 l6 -7 h-3 l2 -4 Z" fill={BOLT} />;
}

function Fog() {
  return (
    <g stroke={CLOUD} strokeWidth={2} strokeLinecap="round">
      <line x1={4} y1={14} x2={22} y2={14} />
      <line x1={6} y1={19} x2={20} y2={19} />
      <line x1={4} y1={24} x2={22} y2={24} />
    </g>
  );
}

function Glyph({ group, isDay }: { group: WeatherGroup; isDay: boolean }) {
  const lamp = isDay ? <Sun /> : <Moon />;

  switch (group) {
    case 'clear': return lamp;
    case 'partly': return <g>{isDay ? <Sun cx={9} cy={8} r={4} /> : <Moon cx={9} cy={8} r={4} />}<Cloud x={2} y={3} scale={0.95} /></g>;
    case 'cloudy': return <g><Cloud x={-1} y={4} scale={0.8} fill={CLOUD_DARK} /><Cloud x={3} y={2} /></g>;
    case 'fog': return <Fog />;
    case 'drizzle': return <g><Cloud x={2} y={-1} /><Drops n={2} y={20} /></g>;
    case 'rain': return <g><Cloud x={2} y={-2} /><Drops n={3} y={19} /></g>;
    case 'showers': return <g>{isDay && <Sun cx={20} cy={6} r={3.2} />}<Cloud x={0} y={0} /><Drops n={3} y={21} /></g>;
    case 'snow': return <g><Cloud x={2} y={-2} /><Flakes n={3} y={22} /></g>;
    case 'snow_showers': return <g>{isDay && <Sun cx={20} cy={6} r={3.2} />}<Cloud x={0} y={0} /><Flakes n={2} y={23} /></g>;
    case 'freezing': return <g><Cloud x={2} y={-2} fill={CLOUD_DARK} /><Drops n={2} y={19} color={SNOW} /><Flakes n={1} y={25} /></g>;
    case 'thunder': return <g><Cloud x={2} y={-3} fill={CLOUD_DARK} /><Bolt /></g>;
    case 'hail': return <g><Cloud x={2} y={-3} fill={CLOUD_DARK} /><Bolt /><circle cx={9} cy={24} r={1.6} fill={SNOW} /><circle cx={20} cy={26} r={1.6} fill={SNOW} /></g>;
    default: return <Cloud x={2} y={2} />;
  }
}

const GROUPS: WeatherGroup[] = [
  'clear', 'partly', 'cloudy', 'fog', 'drizzle', 'rain', 'showers',
  'snow', 'snow_showers', 'freezing', 'thunder', 'hail',
];

const spriteId = (group: WeatherGroup, isDay: boolean) => `wx-${group}-${isDay ? 'd' : 'n'}`;

/**
 * Sprite con todos los símbolos. Se pone **una vez** por página, oculto, y los
 * iconos lo referencian con `<use>`.
 */
export function WeatherIconSprite() {
  return (
    <svg width={0} height={0} aria-hidden focusable="false" style={{ position: 'absolute' }}>
      <defs>
        {GROUPS.flatMap((group) => [true, false].map((isDay) => (
          <symbol key={spriteId(group, isDay)} id={spriteId(group, isDay)} viewBox="0 0 32 32">
            <Glyph group={group} isDay={isDay} />
          </symbol>
        )))}
      </defs>
    </svg>
  );
}

interface Props {
  code: number | null | undefined;
  isDay?: boolean;
  size?: number;
  className?: string;
  /**
   * Dibuja el icono entero en vez de referenciar el sprite. Para usos sueltos
   * donde no compensa arrastrar el sprite (una tarjeta, un correo).
   */
  standalone?: boolean;
}

export function WeatherIcon({ code, isDay = true, size = 32, className, standalone = false }: Props) {
  const w = weatherCode(code);
  const label = w.caLong;

  return (
    <svg
      viewBox="0 0 32 32" width={size} height={size} className={className}
      role="img" aria-label={label} style={{ flexShrink: 0 }}
    >
      <title>{label}</title>
      {standalone
        ? <Glyph group={w.group} isDay={isDay} />
        : <use href={`#${spriteId(w.group, isDay)}`} />}
    </svg>
  );
}
