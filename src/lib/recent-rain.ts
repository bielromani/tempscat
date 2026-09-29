/**
 * La pluja dels dos últims dies, que la sèrie diària encara no té.
 *
 * ## El defecte que arregla
 *
 * El conjunt diari de la XEMA (`7bvh-jvq2`) es publica **amb dos dies de
 * retard**, i el bloc «L'aigua que ha caigut» comptava des de l'últim dia
 * d'aquella sèrie. El 29 de setembre de 2026, a Lilla, la mateixa fitxa deia
 * «Pluja 24 h: 16,6 mm» a dalt i «Últim ruixat: fa més de 45 dies» a baix, les
 * dues de la mateixa estació. Cap de les dues xifres era falsa; juntes, una
 * semblava un error. Era un dia d'avisos, que és justament quan la gent mira.
 *
 * Els dos dies que falten ja els tenim: el worker d'observació agrega la pluja
 * semihorària des de la mitjanit de Madrid (`today`) i la del dia natural
 * anterior (`yesterday`). Aquí s'enganxen al final de la sèrie.
 *
 * ## Tres regles
 *
 *  · **La sèrie diària mana on ja té valor.** És el conjunt que el Meteocat
 *    publica per dia; la suma semihorària només omple el que encara no hi és.
 *  · **Un dia sense dada es queda sense dada.** Si entre l'últim dia de la sèrie
 *    i avui en falta un que cap de les dues fonts no cobreix, entra com a nul,
 *    i un nul talla els comptes igual que a la resta del projecte: un dia sense
 *    dada no és un dia sec.
 *  · **El dia d'avui és el de l'agregat, no el del rellotge.** Una lectura de
 *    les 23:50 servida a les 00:10 porta la pluja d'ahir a `today`; posar-la a
 *    la data del rellotge la faria caure un dia més tard. Per això `day` el dona
 *    qui llegeix la instantània. Ver `aggregatesDay` a `currentFor()`.
 *
 * No importa res: la fan servir la fitxa, la de l'estació i el worker de
 * l'històric, i la prova és `npm run test:rain`.
 */

export interface RainDay {
  day: string;
  precip: number | null;
}

/** El que ha mesurat l'estació avui i ahir, i de quin dia és «avui». */
export interface MeasuredRain {
  /** Dia natural de Madrid al qual pertany `today`, `AAAA-MM-DD`. */
  day: string;
  today: number | null;
  yesterday: number | null;
}

/** Llindar de «dia amb pluja» dels comptadors: el mateix que el de la XEMA. */
export const RAIN_DAY_MM = 0.2;

/** `2026-09-29` + 1 → `2026-09-30`. En UTC per no dependre de la zona del servidor. */
export function addDays(day: string, n: number): string {
  const t = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * La sèrie de pluja, allargada fins al dia de l'agregat.
 *
 * Torna una còpia: la sèrie original la fan servir altres blocs —el clima, els
 * comptadors— que diuen explícitament fins a quin dia arriben.
 */
export function withMeasuredRain(series: RainDay[], measured: MeasuredRain | null): RainDay[] {
  const out = series.map((d) => ({ day: d.day, precip: d.precip }));
  if (!measured || !out.length) return out;

  const byDay = new Map<string, number | null>([
    [addDays(measured.day, -1), measured.yesterday],
    [measured.day, measured.today],
  ]);

  for (const d of out) {
    if (d.precip == null && byDay.get(d.day) != null) d.precip = byDay.get(d.day)!;
  }

  // Fins a seixanta dies de forat com a molt: més enllà, l'estació no és a la
  // sèrie per cap motiu que es pugui tapar amb dos dies de lectures.
  const last = out[out.length - 1].day;
  for (let d = addDays(last, 1), i = 0; d <= measured.day && i < 60; d = addDays(d, 1), i++) {
    out.push({ day: d, precip: byDay.get(d) ?? null });
  }

  /*
   * Un avui sense cap lectura encara no és un dia perdut.
   *
   * De les 00:00 fins a una hora llarga després, la XEMA no ha publicat res del
   * dia —va de 45 a 65 minuts tard— i `today` arriba nul. Enganxat com a nul,
   * tallava els comptes cada nit: «no consta» i «falten dies» durant una hora,
   * a totes les fitxes. Ahir sí que compta com a forat si no hi és, perquè a
   * aquella hora ja s'ha tancat.
   */
  if (out[out.length - 1].day === measured.day && out[out.length - 1].precip == null) out.pop();
  return out;
}

/**
 * Dies seguits sense pluja, comptant enrere des de l'últim.
 *
 * Un dia sense dada talla el compte: no és un dia sec. És la regla que va donar
 * 398 dies sense pluja al Port de Barcelona, que no té pluviòmetre.
 */
export function dryStreakOf(days: RainDay[]): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const mm = days[i].precip;
    if (mm == null || mm >= RAIN_DAY_MM) break;
    n++;
  }
  return n;
}
