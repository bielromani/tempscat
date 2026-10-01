import { weatherCode } from '@/lib/weather-codes';

/**
 * Icones del temps: els Meteocons de Bas Milius (MIT), servits des de `public/`.
 *
 * ## Per què uns icones de fora, i per què fitxers i no SVG en línia
 *
 * Els d'abans eren quatre traços dibuixats aquí mateix, i es notava: al
 * redisseny del 29 de setembre de 2026 eren el que feia que la fitxa semblés
 * una eina interna i no un portal del temps. Els Meteocons són els que fan
 * servir moltes aplicacions del temps, pesen entre 0,8 i 3 kB cadascun i
 * porten versió estàtica i animada. La llicència és a `public/icons/w/LICENSE`.
 *
 * Van com a `<img>` i no en línia: cada un porta degradats amb `id` propi, i
 * trenta còpies a la mateixa pàgina farien xocar els identificadors. Com a
 * fitxer, el navegador en baixa **un cop** cadascun i el reaprofita a les 48
 * hores de la taula: una fitxa en demana una desena, no quaranta-vuit.
 *
 * L'animada només va al titular, i a qui té el moviment reduït se li serveix
 * l'estàtica: l'animació és dins de l'SVG i no la pot aturar cap regla de CSS.
 */

/** El nom del fitxer Meteocons per a un codi WMO, de dia o de nit. */
export function weatherIconName(code: number | null | undefined, isDay = true): string {
  const dn = isDay ? 'day' : 'night';
  const c = code ?? -1;
  if (c === 0) return `clear-${dn}`;
  if (c === 1 || c === 2) return `partly-cloudy-${dn}`;
  if (c === 3) return 'overcast';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 51 && c <= 55) return 'drizzle';
  if (c === 56 || c === 57 || c === 66 || c === 67) return 'sleet';
  if (c === 61 || c === 63) return 'rain';
  if (c === 65 || c === 82) return 'extreme-rain';
  if (c === 71 || c === 73 || c === 77) return 'snow';
  if (c === 75) return 'extreme-snow';
  if (c === 80 || c === 81) return `partly-cloudy-${dn}-rain`;
  if (c === 85 || c === 86) return `partly-cloudy-${dn}-snow`;
  if (c === 95) return `thunderstorms-${dn}-rain`;
  if (c === 96 || c === 99) return 'hail';
  return 'not-available';
}

/** La ruta de l'icona, per a qui la col·loca dins d'un altre SVG (el meteograma). */
export function weatherIconSrc(code: number | null | undefined, isDay = true): string {
  return `/icons/w/${weatherIconName(code, isDay)}.svg`;
}

interface Props {
  code: number | null | undefined;
  isDay?: boolean;
  size?: number;
  className?: string;
  /** L'animada. Només al titular: a una llista de catorze dies seria soroll. */
  animated?: boolean;
  /**
   * Buit quan al costat ja hi ha el nom del temps escrit: un lector de pantalla
   * el llegiria dues vegades.
   */
  decorative?: boolean;
}

export function WeatherIcon({ code, isDay = true, size = 32, className, animated = false, decorative = false }: Props) {
  const name = weatherIconName(code, isDay);
  const alt = decorative ? '' : weatherCode(code).caLong;
  const style = { flexShrink: 0 } as const;

  if (!animated || name === 'not-available') {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- un SVG de 2 kB no passa per l'optimitzador d'imatges
      <img src={`/icons/w/${name}.svg`} width={size} height={size} alt={alt} className={className} style={style} />
    );
  }
  return (
    <picture>
      <source srcSet={`/icons/w/${name}.svg`} media="(prefers-reduced-motion: reduce)" />
      <img src={`/icons/w-anim/${name}.svg`} width={size} height={size} alt={alt} className={className} style={style} />
    </picture>
  );
}
