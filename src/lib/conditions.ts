import 'server-only';
import { historyOfStation, localToday, type StationHistory } from './weather';
import { dryStreakOf, withMeasuredRain, type MeasuredRain, type RainDay } from './recent-rain';

/**
 * L'aigua acumulada d'una estació, per al bloc de pluja d'una fitxa.
 *
 * ## La regla que manda aquí
 *
 * **Se explican las condiciones, no se puntúan.** Un «7,5/10 per anar a buscar
 * bolets» es un número inventado que nadie puede discutir y que no sale de
 * ninguna parte. «Han caigut 42 mm en quinze dies i l'últim ruixat important va
 * ser fa nou» es un dato, y quien sabe de bolets lo interpreta mejor que
 * nosotros.
 *
 * Esa distinción no es estilística. Un índice compuesto oculta qué lo mueve: si
 * el número baja, el lector no sabe si es por la lluvia, por la temperatura o por
 * un peso que alguien eligió a ojo. Los tres números por separado no ocultan nada.
 *
 * ## Por qué salen de la XEMA y no del modelo
 *
 * Lo que decide es la lluvia **que ha caído**, no la que se preveía. `xema-history`
 * ya guarda 45 días de serie diaria por estación, así que esto no cuesta ninguna
 * petición: es aritmética sobre datos que ya están en memoria.
 */

export interface RainConditions {
  station: string;
  /** Acumulado de los últimos 15 días, mm. */
  rain15: number;
  /** Y de los últimos 30. */
  rain30: number;
  /** Días con dato en la ventana de 15: si son pocos, el acumulado engaña. */
  days15: number;
  /**
   * Días desde el último día de lluvia apreciable (≥ 5 mm).
   *
   * Es la cifra que más usa quien va a buscar bolets, porque lo que importa no es
   * solo cuánta agua ha caído sino **cuándo**: el micelio tarda de una a tres
   * semanas en fructificar después de una buena mojada.
   *
   * Null cuando en toda la serie reciente no ha llovido así: no es «hace 45 días»,
   * es «no consta».
   */
  daysSinceRain: number | null;
  /**
   * Cuántos días seguidos se han podido mirar hacia atrás sin encontrar lluvia.
   *
   * Distingue las dos razones por las que `daysSinceRain` es null, que la página
   * confundía en un solo «no consta»: en Tàrrega, con 8,1 mm en treinta días
   * repartidos en llovizna, la respuesta no era «no lo sabemos— era «hace más
   * de 45 días que no cae un chaparrón de verdad», que es justo lo que quiere
   * saber quien lo mira. Si un día sin dato corta la cuenta antes, este número
   * es menor y entonces sí que no se sabe.
   */
  dryDaysChecked: number;
  /**
   * El último día que cuentan los números de lluvia.
   *
   * Hoy cuando la observación lo trae, que es lo normal. Sin ella, el último de
   * la serie diaria, que va dos días tarde.
   */
  through: string;
  /**
   * Días seguidos sin llegar a 0,2 mm, hasta `through`.
   *
   * El worker de histórico guarda el mismo número en `dryStreak`, pero hasta
   * donde llega su serie: dos días de menos, y ciego a lo que haya llovido hoy.
   */
  dryStreak: number;
  /** Media de las mínimas de los últimos diez días. */
  tMinAvg10: number | null;
  /** Media de las máximas de los últimos diez días. */
  tMaxAvg10: number | null;
  /** Si ha helado en los últimos diez días. La helada corta la temporada. */
  frostRecently: boolean;
}

/** Umbral de «ruixat important»: por debajo, el suelo no llega a mojarse en serio. */
const WET_DAY_MM = 5;

/**
 * L'acumulat d'una sèrie diària que ja es té a la mà.
 *
 * Exportada perquè la fitxa d'un poble **ja s'ha baixat** la sèrie de la seva
 * estació per al bloc de clima. Passant-la per aquí, el bloc de pluja no costa
 * ni una petició ni un byte de més: és aritmètica sobre el que ja hi ha.
 * `rainConditionsFor()` és per a qui encara no la té.
 */
export function rainConditionsOf(
  history: StationHistory,
  today: string,
  measured: MeasuredRain | null = null,
): RainConditions | null {
  const daily = history.daily.filter((d) => d.day <= today);
  if (daily.length < 10) return null;

  /*
   * La pluja, fins avui; les temperatures, fins on arriba la sèrie.
   *
   * La sèrie diària va dos dies tard i sense `measured` els comptes de pluja
   * s'acabaven abans d'ahir: amb 16,6 mm caiguts avui, el bloc deia que l'últim
   * ruixat era de feia més de 45 dies. Ver `recent-rain.ts`. Les temperatures
   * no s'hi enganxen: les d'avui venen corregides per l'altitud del lloc i les
   * de la sèrie són les de l'estació, i barrejar-les en una mitjana de deu dies
   * seria sumar dues coses diferents.
   */
  const wet = withMeasuredRain(daily, measured).filter((d) => d.day <= today);

  const lastN = <T>(days: T[], n: number) => days.slice(-n);

  const sum = (days: RainDay[]) =>
    Math.round(days.reduce((a, d) => a + (d.precip ?? 0), 0) * 10) / 10;

  const withPrecip = (days: RainDay[]) => days.filter((d) => d.precip != null).length;

  const avg = (days: typeof daily, get: (d: (typeof daily)[number]) => number | null) => {
    const xs = days.map(get).filter((v): v is number => v != null);
    return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;
  };

  // Días desde la última lluvia apreciable, contando hacia atrás. Un día sin dato
  // no cuenta como día seco — la misma regla que la racha seca.
  let daysSinceRain: number | null = null;
  let dryDaysChecked = 0;
  for (let i = wet.length - 1; i >= 0; i--) {
    const mm = wet[i].precip;
    if (mm == null) break;
    if (mm >= WET_DAY_MM) {
      daysSinceRain = wet.length - 1 - i;
      break;
    }
    dryDaysChecked++;
  }

  const last10 = lastN(daily, 10);

  return {
    station: history.station,
    rain15: sum(lastN(wet, 15)),
    rain30: sum(lastN(wet, 30)),
    days15: withPrecip(lastN(wet, 15)),
    daysSinceRain,
    dryDaysChecked,
    through: wet[wet.length - 1].day,
    dryStreak: dryStreakOf(wet),
    tMinAvg10: avg(last10, (d) => d.tMin),
    tMaxAvg10: avg(last10, (d) => d.tMax),
    frostRecently: last10.some((d) => d.tMin != null && d.tMin < 0),
  };
}

/** Condiciones acumuladas en la estación de referencia de una ubicación. */
export async function rainConditionsFor(stationCodi: string): Promise<RainConditions | null> {
  const h = await historyOfStation(stationCodi);
  return h ? rainConditionsOf(h, localToday()) : null;
}


/**
 * Qué se puede decir de la lluvia acumulada, en catalán y sin puntuar.
 *
 * Devuelve frases sueltas: la página decide cuántas usa. Ninguna de ellas
 * pronostica setas — dicen lo que ha pasado y dejan la conclusión al lector.
 */
export function rainSentences(c: RainConditions): string[] {
  const out: string[] = [];

  const n = (v: number, d = 0) => v.toFixed(d).replace('.', ',');

  if (c.days15 < 10) {
    out.push(`L'estació només té dada de ${c.days15} dels últims 15 dies, `
      + 'així que l’acumulat es queda curt.');
  }

  out.push(`Han caigut ${n(c.rain15, 1)} mm en els últims quinze dies `
    + `i ${n(c.rain30, 1)} mm en els últims trenta.`);

  if (c.daysSinceRain == null) {
    out.push(`No consta cap dia de més de ${WET_DAY_MM} mm en tota la sèrie recent.`);
  } else if (c.daysSinceRain === 0) {
    out.push('Avui mateix ha plogut de valent.');
  } else {
    out.push(`L'últim dia de més de ${WET_DAY_MM} mm va ser fa ${c.daysSinceRain} `
      + `${c.daysSinceRain === 1 ? 'dia' : 'dies'}.`);
  }

  if (c.tMinAvg10 != null && c.tMaxAvg10 != null) {
    out.push(`Aquests deu dies la mínima ha fet una mitjana de ${n(c.tMinAvg10, 1)} °C `
      + `i la màxima de ${n(c.tMaxAvg10, 1)} °C.`);
  }

  if (c.frostRecently) {
    out.push('Hi ha hagut glaçada en els últims deu dies.');
  }

  return out;
}
