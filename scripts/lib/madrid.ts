// La conversión vive en `src/lib/format.ts`, que no importa nada, porque la
// aplicación también la necesita. Una copia, no dos.
import { madridToUtc } from '../../src/lib/format.ts';

export { madridToUtc };

/**
 * `03/09/26` + ` 9:33` → el instante en UTC.
 *
 * Es el formato de los XML de FGC: día/mes/año de dos cifras y una hora que a
 * veces lleva el cero delante y a veces un espacio. El año de dos cifras se
 * expande al 2000, que es lo único razonable para un dato en vivo.
 */
export function fgcTimestamp(date: string, time: string): Date | null {
  const d = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const t = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!d || !t) return null;

  const year = Number(d[3]) < 100 ? 2000 + Number(d[3]) : Number(d[3]);
  const at = madridToUtc(year, Number(d[2]), Number(d[1]), Number(t[1]), Number(t[2]));
  return Number.isNaN(at.getTime()) ? null : at;
}
