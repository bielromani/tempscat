import { msToKmh } from './variables.ts';
import { dailySummaryCode, weatherCode } from './weather-codes.ts';
import { num, relativeDay } from './format.ts';
import type { CurrentConditions, HourlyPoint, LocationForecast } from './forecast-types.ts';

/**
 * Del dato a la frase.
 *
 * El diagnóstico que justifica este fichero: la web tenía los datos bien y
 * seguía costando leerla. Quien entra desde Google quiere **una frase** —
 * «avui sol i 30 °C, la pluja arriba cap a les cinco»— y lo que encontraba era
 * un meteograma de 48 horas y una tabla de 48 filas. Los datos estaban; el
 * trabajo de interpretarlos se le dejaba al lector.
 *
 * Cuatro reglas, todas heredadas de describe.ts porque allí ya funcionaron:
 *
 *  1. **Plantillas deterministas, nunca un modelo en tiempo de ejecución.** Con
 *     4.293 páginas, un generativo produce cuatro mil afirmaciones que nadie ha
 *     comprobado. Aquí cada frase sale de un número que está en el fichero.
 *  2. **Si el dato no está, la frase no se escribe.** Vale más un párrafo corto
 *     y cierto que uno largo con rellenos.
 *  3. **Ninguna frase promete más precisión que la fuente.** «Cap a les 17 h»,
 *     no «a les 17.00»: la predicción horaria no distingue el minuto, y
 *     escribirlo así sería fingir que sí.
 *  4. **Nada de leer el reloj aquí.** La hora en curso y el día llegan como
 *     argumentos. Es lo que permite probar este módulo y lo que evita que un
 *     componente deje de ser puro.
 *
 * Los imports llevan la extensión `.ts` explícita a propósito: este fichero lo
 * carga también `scripts/test-narrative.ts` con Node, y Node la exige. Sus cuatro
 * dependencias son ficheros que no importan nada, así que la cadena se corta ahí
 * y no arrastra `node:fs`. Ver `src/lib/forecast-types.ts`.
 */

// ── Franjas del día ─────────────────────────────────────────────────────────

/**
 * Las cuatro franjas del día en catalán.
 *
 * Cuatro cifras en lugar de veinticuatro. Para la mayoría de las consultas
 * —«plourà a la tarda?»— la franja es exactamente la resolución que se necesita,
 * y la tabla horaria se queda para quien quiera el detalle.
 *
 * Los cortes no son simétricos porque el día tampoco lo es: la tarda catalana
 * llega hasta el vespre y la matinada es corta. Un reparto en cuartos de 6 h
 * pondría las 19 h en «nit», que no es lo que nadie entiende.
 */
export const DAY_PARTS = [
  { key: 'matinada', nom: 'Matinada', from: 0, to: 5 },
  { key: 'mati', nom: 'Matí', from: 6, to: 12 },
  { key: 'tarda', nom: 'Tarda', from: 13, to: 19 },
  { key: 'nit', nom: 'Nit', from: 20, to: 23 },
] as const;

export type DayPartKey = typeof DAY_PARTS[number]['key'];

export interface DayPart {
  key: DayPartKey;
  nom: string;
  /** Día natural al que pertenece, para poder rotular «demà a la tarda». */
  day: string;
  /** Etiqueta ya montada: «Avui a la tarda», «Demà al matí». */
  label: string;
  first: string;
  last: string;
  tMin: number | null;
  tMax: number | null;
  weatherCode: number | null;
  isDay: boolean;
  precip: number;
  precipProb: number;
  windMax: number | null;
  gustMax: number | null;
  uvMax: number | null;
}

/** «Avui a la tarda» / «Demà al matí» — con la preposición que le toca. */
function partLabel(key: DayPartKey, nom: string, day: string, today: string): string {
  const when = relativeDay(day, today);
  const prep = key === 'mati' ? 'al matí' : `a la ${nom.toLowerCase()}`;
  // Cuando el día no es hoy ni mañana, relativeDay devuelve el nombre del día
  // («dijous») y ahí la preposición cambia: «dijous a la tarda», sin «el».
  return `${when.charAt(0).toUpperCase()}${when.slice(1)} ${prep}`;
}

/**
 * Agrega la serie horaria en franjas, desde la hora en curso.
 *
 * Se descartan las franjas con menos de dos horas de datos: media franja
 * agregada y presentada igual que una completa es una comparación falsa — la
 * «tarda» que solo cubre las 19 h no dice nada de la tarde.
 */
export function dayParts(
  hourly: HourlyPoint[],
  nowHour: string,
  today: string,
  maxParts = 5,
): DayPart[] {
  const from = Math.max(0, hourly.findIndex((h) => h.time.slice(0, 13) === nowHour));

  const buckets = new Map<string, HourlyPoint[]>();
  for (const h of hourly.slice(from)) {
    const hh = Number(h.time.slice(11, 13));
    const part = DAY_PARTS.find((p) => hh >= p.from && hh <= p.to);
    if (!part) continue;
    const key = `${h.time.slice(0, 10)}|${part.key}`;
    const arr = buckets.get(key) ?? [];
    arr.push(h);
    buckets.set(key, arr);
  }

  const out: DayPart[] = [];
  for (const [key, hs] of buckets) {
    if (hs.length < 2) continue;
    const [day, partKey] = key.split('|') as [string, DayPartKey];
    const def = DAY_PARTS.find((p) => p.key === partKey)!;

    const nums = (get: (h: HourlyPoint) => number | null): number[] =>
      hs.map(get).filter((v): v is number => v != null);

    const temps = nums((h) => h.temperature);
    const gusts = nums((h) => h.windGust);
    const winds = nums((h) => h.windSpeed);
    const probs = nums((h) => h.precipProbability);
    const uvs = nums((h) => h.uvIndex);

    out.push({
      key: partKey,
      nom: def.nom,
      day,
      label: partLabel(partKey, def.nom, day, today),
      first: hs[0].time,
      last: hs[hs.length - 1].time,
      tMin: temps.length ? Math.min(...temps) : null,
      tMax: temps.length ? Math.max(...temps) : null,
      // El resumen de la franja usa la misma regla que el del día: un fenómeno
      // severo manda aunque dure una hora, y si no manda el cielo más frecuente.
      weatherCode: (() => {
        const c = dailySummaryCode(hs.map((h) => ({ code: h.weatherCode, isDay: h.isDay }))).code;
        return c >= 0 ? c : null;
      })(),
      isDay: hs.filter((h) => h.isDay).length > hs.length / 2,
      precip: Math.round(hs.reduce((s, h) => s + (h.precipitation ?? 0), 0) * 10) / 10,
      precipProb: probs.length ? Math.max(...probs) : 0,
      windMax: winds.length ? Math.max(...winds) : null,
      gustMax: gusts.length ? Math.max(...gusts) : null,
      uvMax: uvs.length ? Math.max(...uvs) : null,
    });
  }
  return out.slice(0, maxParts);
}

// ── Ventanas de lluvia ──────────────────────────────────────────────────────

/**
 * Intensidad de la precipitación, en milímetros por hora.
 *
 * Son los cortes **de la escala de AEMET**, no unos propios: débil hasta 2 mm/h,
 * moderada hasta 15, fuerte hasta 30, muy fuerte hasta 60 y torrencial por
 * encima. Se usan tal cual porque es la escala con la que se redactan los avisos
 * que la gente ya oye en la radio, y tener dos escalas distintas para lo mismo
 * es peor que no tener ninguna.
 *
 * La serie de Open-Meteo da milímetros **por hora**, así que el valor horario ya
 * es directamente la intensidad. No hay que dividir por nada, y conviene decirlo
 * porque el error de tratar el acumulado del tramo como intensidad convierte
 * cuatro gotas repartidas en cinco horas en «pluja moderada».
 */
export type RainIntensity = 'feble' | 'moderada' | 'forta' | 'molt forta' | 'torrencial';

const INTENSITY: Array<{ max: number; nom: RainIntensity }> = [
  { max: 2, nom: 'feble' },
  { max: 15, nom: 'moderada' },
  { max: 30, nom: 'forta' },
  { max: 60, nom: 'molt forta' },
  { max: Infinity, nom: 'torrencial' },
];

export function rainIntensity(mmPerHour: number): RainIntensity {
  return (INTENSITY.find((i) => mmPerHour <= i.max) ?? INTENSITY[INTENSITY.length - 1]).nom;
}

export interface RainWindow {
  from: string;
  to: string;
  /** Acumulado de todo el tramo. */
  mm: number;
  prob: number;
  /** Horas que dura el tramo. */
  hours: number;
  /**
   * La hora que concentra el chaparrón, y cuánto cae en ella.
   *
   * Es el dato que faltaba. «Plou de 4 a 7» describe el tramo y esconde
   * justamente lo que hay que saber: a las cuatro pueden ser cuatro gotas y a
   * las seis una tromba. El acumulado del tramo tampoco lo dice — 12 mm
   * repartidos en cinco horas y 12 mm en una sola hora son dos días distintos.
   */
  peak: { time: string; mm: number };
  /** Intensidad de la hora punta, que es la que decide si hace falta refugio. */
  intensity: RainIntensity;
  /** La punta concentra buena parte del total: el tramo no es plano. */
  concentrated: boolean;
  /** Alguna hora del tramo con código de tormenta. */
  thunder: boolean;
}

/**
 * Cuándo empieza, cuándo para y cuándo aprieta.
 *
 * Es la pregunta que hoy se contesta recorriendo 48 filas a mano, y la respuesta
 * está entera en la serie. Tres detalles que cambian el resultado:
 *
 *  · **Se cuenta como lluvia también la probabilidad alta sin cantidad.** Un 70 %
 *    con 0,0 mm es un chubasco que el modelo sitúa cerca pero no encima; decir
 *    que no llueve sería quedarse con media respuesta.
 *  · **Los huecos de una hora se cosen.** «Plou de 5 a 6, para a les 6 i torna a
 *    les 7» describe la aritmética del modelo, no el día de nadie.
 *  · **Se guarda la hora punta**, no solo el total. Ver  peak.
 */
export function rainWindows(hourly: HourlyPoint[], nowHour: string, hours = 24): RainWindow[] {
  const from = Math.max(0, hourly.findIndex((h) => h.time.slice(0, 13) === nowHour));
  const data = hourly.slice(from, from + hours);

  const wet = (h: HourlyPoint) => (h.precipitation ?? 0) >= 0.1 || (h.precipProbability ?? 0) >= 50;

  const runs: HourlyPoint[][] = [];
  let current: HourlyPoint[] = [];
  let gap = 0;
  for (const h of data) {
    if (wet(h)) {
      if (gap === 1 && runs.length && current.length === 0) current = runs.pop()!;
      current.push(h);
      gap = 0;
    } else if (current.length) {
      gap++;
      if (gap > 1) { runs.push(current); current = []; gap = 0; }
    }
  }
  if (current.length) runs.push(current);

  return runs.map((run) => {
    const total = Math.round(run.reduce((s2, h) => s2 + (h.precipitation ?? 0), 0) * 10) / 10;
    const peakHour = run.reduce((a, b) => ((b.precipitation ?? 0) > (a.precipitation ?? 0) ? b : a));
    const peakMm = Math.round((peakHour.precipitation ?? 0) * 10) / 10;

    return {
      from: run[0].time,
      to: run[run.length - 1].time,
      mm: total,
      prob: Math.max(...run.map((h) => h.precipProbability ?? 0)),
      hours: run.length,
      peak: { time: peakHour.time, mm: peakMm },
      intensity: rainIntensity(peakMm),
      // Concentrado si una sola hora se lleva la mitad del tramo y además cae lo
      // suficiente para notarlo. Sin el segundo requisito, 0,4 mm de 0,6 salían
      // como «el gruix cau a les sis», que es ridículo.
      concentrated: run.length > 1 && peakMm >= 2 && peakMm >= total * 0.5,
      thunder: run.some((h) => THUNDER_CODES.has(h.weatherCode ?? -1)),
    };
  });
}

/** Códigos WMO de tormenta. Cambian la respuesta, no solo el icono. */
const THUNDER_CODES = new Set([95, 96, 99]);

// ── Frases de hora ──────────────────────────────────────────────────────────

/**
 * Por qué llevan el día pegado.
 *
 * Todas las ventanas se buscan en las **próximas 24 horas contadas desde la hora
 * en curso**, así que a media tarde la mitad caen ya en el día siguiente. Sin el
 * día delante salían cosas como «de les 10 a les 14 h» a las tres de la tarde,
 * que el lector solo puede entender como un error.
 *
 * Nunca con minutos: la predicción horaria no distingue el minuto y escribir
 * «a les 17.00» sería fingir que sí.
 */
function dayPrefix(iso: string, today: string): string {
  const day = iso.slice(0, 10);
  if (day === today) return '';
  const r = relativeDay(day, today);
  return r === 'avui' ? '' : `${r} `;
}

/** «cap a les 8 h» / «demà cap a les 8 h». El desplazamiento sirve para el final de un tramo. */
function atPhrase(iso: string, today: string, plus = 0): string {
  const h = Number(iso.slice(11, 13)) + plus;
  // 23 h + 1 no son las 24: se dice medianoche, y sin prefijo de día porque
  // «demà a mitjanit» apuntaría a la noche siguiente.
  if (h >= 24) return 'cap a mitjanit';
  return `${dayPrefix(iso, today)}cap a les ${h} h`;
}

/** «de les 15 a les 18 h» / «demà de les 10 a les 14 h». */
function rangePhrase(from: string, to: string, today: string): string {
  const h0 = Number(from.slice(11, 13));
  const h1 = Number(to.slice(11, 13));
  const p0 = dayPrefix(from, today);

  if (from.slice(0, 10) === to.slice(0, 10)) {
    return h0 === h1
      ? `${p0}cap a les ${h0} h`
      : `${p0}de les ${h0} a les ${h1 + 1} h`;
  }
  // Cruza la medianoche: hay que nombrar los dos días o no se entiende.
  return `${p0}des de les ${h0} h fins ${dayPrefix(to, today)}a les ${h1 + 1} h`;
}

/**
 * La frase de la lluvia.
 *
 * Cuatro formas distintas según lo que diga el perfil, porque los cuatro casos
 * son cuatro días diferentes y aplanarlos en una plantilla única es lo que hacía
 * que la frase no sirviera:
 *
 *  1. **Cuatro gotas.** Probabilidad apreciable y acumulado insignificante. Hay
 *     que decir que es poca cosa, o el lector se queda en casa por 0,3 mm.
 *  2. **Concentrada.** Una hora se lleva la mitad del tramo: se nombra esa hora y
 *     su intensidad, que es lo único que condiciona los planes.
 *  3. **Continua.** El tramo es plano: se dice cuánto dura y con qué intensidad.
 *  4. **Intermitente.** Varios tramos: se listan y se nombra el peor.
 */
function rainSentence(windows: RainWindow[], today: string): string | null {
  if (!windows.length) return null;

  const storm = (w: RainWindow) => (w.thunder ? ', amb tempesta' : '');

  if (windows.length === 1) {
    const w = windows[0];

    /*
     * El umbral va en la **punta**, no en el total.
     *
     * Con el total, «0,6 mm repartits en tres hores» pasaba de largo y se
     * describía como «plou de forma contínua», que es exactamente lo contrario de
     * lo que pasa. Si ninguna hora del tramo llega a medio milímetro, la lluvia
     * no pasa de plugim por mucho que dure — y da igual que sean tres horas o
     * nueve.
     *
     * La frase decía «quatre gotes», que es de conversación y no de un servicio
     * meteorológico. Ahora dice qué pasa —plugim, y no llega a mojar el suelo—,
     * que es lo mismo y además es comprobable.
     */
    if (w.peak.mm < 0.5) {
      return `Plugim ${rangePhrase(w.from, w.to, today)}, amb un ${w.prob} % de `
        + `probabilitat i ${num(w.mm, 1)} mm en tot el tram: no arriba a mullar `
        + `el terra${storm(w)}.`;
    }

    if (w.concentrated) {
      return `La pluja entra ${atPhrase(w.from, today)} i para ${atPhrase(w.to, today, 1)}, `
        + `però el gruix cau ${atPhrase(w.peak.time, today)}: ${num(w.peak.mm, 1)} mm en una hora, `
        + `pluja ${w.intensity}${storm(w)}. En total, ${num(w.mm, 1)} mm.`;
    }

    if (w.hours === 1) {
      return `Un ruixat curt ${atPhrase(w.from, today)}, ${num(w.mm, 1)} mm `
        + `de pluja ${w.intensity}${storm(w)}.`;
    }

    return `Plou de forma contínua ${rangePhrase(w.from, w.to, today)}: ${num(w.mm, 1)} mm `
      + `en ${w.hours} h, sempre ${w.intensity}${storm(w)}.`;
  }

  const worst = windows.reduce((a, b) => (b.peak.mm > a.peak.mm ? b : a));
  const total = Math.round(windows.reduce((s2, w) => s2 + w.mm, 0) * 10) / 10;
  const ranges = windows.map((w) => rangePhrase(w.from, w.to, today)).join(' i ');

  return `Ruixats intermitents, ${ranges}. El més fort ${atPhrase(worst.peak.time, today)}: `
    + `${num(worst.peak.mm, 1)} mm en una hora, pluja ${worst.intensity}${storm(worst)}. `
    + `En total, ${num(total, 1)} mm.`;
}

// ── Lo que hay que tener en cuenta ──────────────────────────────────────────

/**
 * Las advertencias del día, en prosa.
 *
 * La primera versión de esto era una rejilla de tarjetas de preguntas y
 * respuestas —«cal paraigua?», «es pot estendre la roba?»— y se descartó por dos
 * razones distintas:
 *
 *  1. **Media rejilla no informaba de nada.** «Es pot estendre la roba» no tiene
 *     umbral real: la respuesta es sí casi siempre, y tender a otra hora tampoco
 *     pasa nada. Y «millor moment per sortir» salía de una puntuación de
 *     comodidad con pesos inventados por nosotros, que es exactamente lo que este
 *     proyecto no hace: un número que nadie puede discutir porque no sale de
 *     ninguna parte.
 *  2. **Lo que sí informaba estaba duplicado.** El índice UV y la racha máxima ya
 *     salen en las tarjetas de franja, y allí además están situados en el tiempo.
 *
 * Lo que queda son solo las cosas con **umbral real y citable**, y van en prosa,
 * que es el idioma del resto del sitio. Casi todos los días esta lista está vacía
 * o tiene un elemento, y eso es lo correcto.
 */
export function dayNotes(hourly: HourlyPoint[], nowHour: string, today: string): string[] {
  const from = Math.max(0, hourly.findIndex((h) => h.time.slice(0, 13) === nowHour));
  const next24 = hourly.slice(from, from + 24);
  if (next24.length < 6) return [];

  const notes: string[] = [];

  // ── Helada ── 0 °C es un umbral físico, no una opinión.
  const night = next24.filter((h) => {
    const hh = Number(h.time.slice(11, 13));
    return hh >= 20 || hh <= 9;
  });
  const nightTemps = night.map((h) => h.temperature).filter((v): v is number => v != null);
  if (nightTemps.length >= 4) {
    const min = Math.min(...nightTemps);
    const at = night.find((h) => h.temperature === min);
    const when = at ? ` ${atPhrase(at.time, today)}` : '';
    if (min <= 0) {
      notes.push(`Glaçarà: la mínima baixa a ${num(min, 0)} °C${when}.`);
    } else if (min <= 3) {
      notes.push(`Nit freda, ${num(min, 0)} °C${when}; als fondals i les zones `
        + 'arrecerades pot glaçar.');
    }
  }

  // ── Ultravioleta ── el 6 es el límite de la banda «alt» de l'OMS, no nuestro.
  const uvRun = longestRun(next24, (h) => (h.uvIndex ?? 0) >= 6);
  if (uvRun.length) {
    const uvMax = Math.max(...uvRun.map((h) => h.uvIndex ?? 0));
    notes.push(`L'índex UV arriba a ${uvMax} ${rangePhrase(uvRun[0].time, uvRun[uvRun.length - 1].time, today)}, `
      + `dins la banda ${uvMax >= 8 ? 'molt alta' : 'alta'} de l’OMS.`);
  }

  // ── Viento ── 62 km/h es el inicio de la fuerza 8 de Beaufort: «vent dur».
  const gustHour = next24.reduce<HourlyPoint | null>(
    (a, b) => ((b.windGust ?? 0) > (a?.windGust ?? 0) ? b : a), null,
  );
  if (gustHour?.windGust != null && msToKmh(gustHour.windGust) >= 62) {
    const kmh = msToKmh(gustHour.windGust);
    notes.push(`Ratxes de fins a ${kmh.toFixed(0)} km/h ${atPhrase(gustHour.time, today)}, `
      + `${kmh >= 89 ? 'força 10 de Beaufort' : 'força 8 de Beaufort'}.`);
  }

  /*
   * ── Sensación térmica ──
   *
   * No hay umbral que citar, así que se dice el hecho y la causa. Pero la causa
   * **hay que comprobarla**, no deducirla del signo: la sensación solo se separa
   * de la temperatura por dos mecanismos, y cada uno tiene su rango.
   *
   * El índice de calor solo aplica por encima de 27 °C y el enfriamiento eólico
   * por debajo de 10 °C — son los mismos límites que usa apparentTemperature() en
   * variables.ts, y fuera de ellos la sensación *es* la temperatura.
   *
   * Sin esta comprobación, un desajuste de los datos escribía «la humitat fa que
   * els 0 °C es notin com 14 °C», que es una frase imposible. Lo detectó el test
   * con un perfil sintético mal formado, que es exactamente para lo que sirve.
   */
  const gaps = next24
    .map((h) => (h.apparent != null && h.temperature != null
      ? { h, gap: h.apparent - h.temperature, t: h.temperature } : null))
    .filter((x): x is { h: HourlyPoint; gap: number; t: number } => x != null)
    // Bochorno solo con calor; sensación de frío solo con frío o viento de verdad.
    .filter((x) => (x.gap > 0 ? x.t >= 25 : x.t <= 12 || msToKmh(x.h.windSpeed ?? 0) >= 20));

  if (gaps.length) {
    const worst = gaps.reduce((a, b) => (Math.abs(b.gap) > Math.abs(a.gap) ? b : a));
    if (Math.abs(worst.gap) >= 3) {
      const cause = worst.gap > 0 ? 'La humitat' : 'El vent';
      notes.push(`${cause} fa que els ${num(worst.t, 0)} °C `
        + `${atPhrase(worst.h.time, today)} es notin com ${num(worst.h.apparent, 0)} °C.`);
    }
  }

  return notes;
}

/** La racha más larga que cumple una condición. */
function longestRun(data: HourlyPoint[], ok: (h: HourlyPoint) => boolean): HourlyPoint[] {
  let best: HourlyPoint[] = [];
  let cur: HourlyPoint[] = [];
  for (const h of data) {
    if (ok(h)) {
      cur.push(h);
      if (cur.length > best.length) best = cur;
    } else {
      cur = [];
    }
  }
  return best;
}

// ── El titular ──────────────────────────────────────────────────────────────

export interface Narrative {
  /** Frase de hoy: cielo, máxima y mínima. */
  today: string;
  /** El cambio que condiciona el día: la lluvia, el viento, la helada. */
  change: string | null;
  /** Tendencia de mañana. */
  tomorrow: string | null;
  /** Comparación con ayer, medida contra la misma estación. */
  vsYesterday: string | null;
  /** Hasta dónde coinciden los modelos, en palabras. */
  uncertainty: string | null;
  parts: DayPart[];
  /** Lo que hay que tener en cuenta, en prosa y solo con umbrales citables. */
  notes: string[];
  windows: RainWindow[];
}

/**
 * Acuerdo entre modelos, dicho en catalán.
 *
 * La franja sombreada del meteograma es correcta y nadie sabe leerla. Lo que
 * hace falta saber es hasta qué día se puede confiar en el número, y eso es una
 * frase, no un área.
 *
 * El umbral de 2 °C de desviación media no es arbitrario: por debajo, la
 * diferencia entre modelos es menor que el error que ya introduce la corrección
 * por altitud, así que decir «coincideixen» es honesto.
 */
function uncertaintyPhrase(
  forecast: LocationForecast,
  today: string,
): string | null {
  if (forecast.nModels < 2) return null;

  const byDay = new Map<string, number[]>();
  for (const h of forecast.hourly) {
    if (h.spread == null) continue;
    const day = h.time.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(h.spread);
    byDay.set(day, arr);
  }
  if (byDay.size < 2) return null;

  const days = [...byDay].map(([day, xs]) => ({
    day,
    mean: xs.reduce((a, b) => a + b, 0) / xs.length,
  }));

  const firstNoisy = days.find((d) => d.mean >= 2);
  if (!firstNoisy) {
    return `Els ${forecast.nModels} models coincideixen en tot l'horitzó: el marge de desacord es queda per sota dels 2 °C.`;
  }
  if (firstNoisy.day === days[0].day) {
    return `Els ${forecast.nModels} models ja no coincideixen avui — hi ha ${num(firstNoisy.mean, 1)} °C de desacord de mitjana. Val la pena tornar-hi més tard.`;
  }
  const when = relativeDay(firstNoisy.day, today);
  return `Els ${forecast.nModels} models coincideixen fins ${when === 'demà' ? 'demà' : when}; a partir d'aquí el desacord puja a ${num(firstNoisy.mean, 1)} °C i la predicció s'ha de llegir com una tendència.`;
}

/**
 * La máxima que se espera hoy: la prevista, o la observada si ya la ha superado.
 *
 * Una máxima que **ya ha ocurrido** es un hecho y gana a una predicción. Sin
 * esto, la página decía «30 °C de màxima» a las cuatro de la tarde con el
 * termómetro marcando 31,8 — y en la frase siguiente, sacada de la observación,
 * aparecía el 31,8. Dos cifras contradictorias en dos líneas seguidas.
 */
function expectedMax(
  forecastMax: number | null,
  observedMax: number | null,
): { value: number | null; alreadyReached: boolean } {
  if (observedMax == null) return { value: forecastMax, alreadyReached: false };
  if (forecastMax == null) return { value: observedMax, alreadyReached: true };
  return observedMax > forecastMax + 0.4
    ? { value: observedMax, alreadyReached: true }
    : { value: forecastMax, alreadyReached: false };
}

/**
 * Cómo va el día comparado con ayer.
 *
 * Dos trampas, las dos reales:
 *
 *  · **Ayer no puede salir del histórico diario.** Ese dataset lleva dos días de
 *    retraso —comprobado—, así que la frase no aparecía nunca. Sale del mismo
 *    agregado semihorario que hoy, con la misma corrección de altitud, y así la
 *    resta compara lo mismo.
 *
 *  · **No se compara la máxima *hasta ahora* con la máxima *entera* de ayer.** A
 *    las ocho de la mañana eso daba «14 graus menys que ahir», que es cierto y
 *    no significa nada. Se compara la máxima esperada de hoy —previsión, o
 *    observación si ya la ha pasado— con la de ayer: dos máximas de día completo.
 */
function yesterdayPhrase(
  current: CurrentConditions | null,
  todayMax: number | null,
): string | null {
  if (!current) return null;

  const parts: string[] = [];

  if (todayMax != null && current.yesterdayMax != null) {
    const diff = Math.round((todayMax - current.yesterdayMax) * 10) / 10;
    parts.push(Math.abs(diff) < 1
      ? `Una màxima pràcticament igual que la d'ahir (${num(current.yesterdayMax, 1)} °C)`
      : `${Math.abs(Math.round(diff))} graus ${diff > 0 ? 'més' : 'menys'} que ahir, `
        + `que va arribar als ${num(current.yesterdayMax, 1)} °C`);
  }

  // La mínima de la madrugada ya es un hecho medido, no una previsión.
  if (current.todayMin != null) {
    parts.push(`la mínima d'aquesta matinada ha estat de ${num(current.todayMin, 1)} °C`);
  }

  if (!parts.length) return null;
  const text = parts.join(' i ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/**
 * El titular de la ficha.
 *
 * Va inmediatamente después del panel de condiciones actuales: el número grande
 * es el gancho y esta frase es la interpretación. Antes había un salto directo
 * del termómetro al meteograma, y ahí es donde se perdía la gente.
 */
export function narrativeFor(
  forecast: LocationForecast | null,
  current: CurrentConditions | null,
  nowHour: string,
  today: string,
): Narrative | null {
  if (!forecast || !forecast.daily.length) return null;

  const d0 = forecast.daily[0];
  const d1 = forecast.daily[1] ?? null;
  const windows = rainWindows(forecast.hourly, nowHour);
  const parts = dayParts(forecast.hourly, nowHour, today);

  // ── Frase 1: el día ──
  const sky = weatherCode(d0.weatherCode);
  const max = expectedMax(d0.tMax, current?.todayMax ?? null);
  // La mínima del día ya ha pasado casi siempre, así que si la medida es más
  // baja que la prevista, manda la medida.
  const minValue = current?.todayMin != null && d0.tMin != null
    ? Math.min(current.todayMin, d0.tMin)
    : current?.todayMin ?? d0.tMin;

  const bits: string[] = [];
  if (sky.code >= 0) bits.push(sky.caLong.toLowerCase());
  if (max.value != null) {
    bits.push(max.alreadyReached
      ? `ja s'han fet ${num(max.value, 1)} °C`
      : `${num(max.value, 0)} °C de màxima`);
  }
  // La mínima solo va aquí cuando no hay observación que la diga después: si la
  // frase siguiente ya la da medida y con un decimal, repetirla redondeada es
  // hacer dudar al lector de cuál de las dos es la buena.
  if (minValue != null && current?.todayMin == null) bits.push(`${num(minValue, 0)} de mínima`);
  const todaySentence = bits.length
    ? `Avui, ${bits.join(', ')}.`
    : 'Avui no hi ha prou dades per resumir el dia.';

  // ── Frase 2: lo que condiciona el día ──
  let change: string | null = rainSentence(windows, today);
  if (!change && d0.snowLevel != null) {
    change = `Nevarà per damunt dels ${d0.snowLevel} m.`;
  } else if (!change && d0.gustMax != null && msToKmh(d0.gustMax) >= 62) {
    change = `El que marca el dia és el vent: ratxes de fins a ${msToKmh(d0.gustMax).toFixed(0)} km/h.`;
  }

  // ── Frase 3: mañana ──
  let tomorrow: string | null = null;
  if (d1 && d0.tMax != null && d1.tMax != null) {
    const diff = Math.round(d1.tMax - d0.tMax);
    const skyT = weatherCode(d1.weatherCode);
    const trend = diff <= -2
      ? `baixa ${Math.abs(diff)} graus`
      : diff >= 2 ? `puja ${diff} graus` : 'es manté';
    const rainT = d1.precipitation >= 1
      ? `, amb ${num(d1.precipitation, 1)} mm`
      : d1.precipProbability >= 40 ? `, amb ${d1.precipProbability} % de probabilitat de pluja` : '';
    tomorrow = `Demà ${trend}${skyT.code >= 0 ? ` i queda ${skyT.ca.toLowerCase()}` : ''}${rainT}.`;
  }

  return {
    today: todaySentence,
    change,
    tomorrow,
    vsYesterday: yesterdayPhrase(current, max.value),
    uncertainty: uncertaintyPhrase(forecast, today),
    parts,
    notes: dayNotes(forecast.hourly, nowHour, today),
    windows,
  };
}
