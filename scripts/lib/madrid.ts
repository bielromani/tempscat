/**
 * Hora local de Madrid → instante, sin biblioteca y sin restar horas a mano.
 *
 * Restar «dos horas en verano y una en invierno» es lo que se rompe el domingo
 * del cambio, y se rompe en silencio: la hora sale plausible y es de otra. Aquí
 * se supone que la hora leída es UTC, se pregunta qué hora marca ese instante
 * en Madrid, y la diferencia es el desplazamiento que hay que quitar.
 *
 * Se repite una vez porque en la madrugada del cambio el desplazamiento del
 * instante supuesto y el del real no son el mismo.
 *
 * Lo usan dos fuentes que dan la hora local sin decir la zona: las rutas de las
 * panorámicas de Roundshot y los XML de meteorología de FGC.
 */
export function madridToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const asMadrid = new Date(guess)
      .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
      .replace(' ', 'T');
    const offset = Date.parse(`${asMadrid}Z`) - guess;
    guess = wall - offset;
  }
  return new Date(guess);
}

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
