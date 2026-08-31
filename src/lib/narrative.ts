import { msToKmh } from './variables';
import { dailySummaryCode, weatherCode } from './weather-codes';
import { hour, num, relativeDay } from './format';
import type { CurrentConditions, HourlyPoint, LocationForecast } from './weather';

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

export interface RainWindow {
  from: string;
  to: string;
  mm: number;
  prob: number;
}

/**
 * Cuándo empieza y cuándo para.
 *
 * Es la pregunta que hoy se contesta recorriendo 48 filas a mano, y la respuesta
 * está entera en la serie. Dos detalles que cambian el resultado:
 *
 *  · **Se cuenta como lluvia también la probabilidad alta sin cantidad.** Un 70 %
 *    con 0,0 mm es un chubasco que el modelo sitúa cerca pero no encima; decir
 *    que no llueve sería quedarse con media respuesta.
 *  · **Los huecos de una hora se cosen.** «Plou de 5 a 6, para a les 6 i torna a
 *    les 7» describe la aritmética del modelo, no el día de nadie.
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

  return runs.map((run) => ({
    from: run[0].time,
    to: run[run.length - 1].time,
    mm: Math.round(run.reduce((s, h) => s + (h.precipitation ?? 0), 0) * 10) / 10,
    prob: Math.max(...run.map((h) => h.precipProbability ?? 0)),
  }));
}

/**
 * Frases de hora, y por qué llevan el día pegado.
 *
 * Todas las ventanas se buscan en las **próximas 24 horas contadas desde la hora
 * en curso**, así que a media tarde la mitad caen ya en el día siguiente. Sin el
 * día delante salían cosas como «es pot estendre la roba de les 10 a les 14 h»
 * a las tres de la tarde, que el lector solo puede entender como un error.
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

/** «cap a les 8 h» / «demà cap a les 8 h». */
function atPhrase(iso: string, today: string): string {
  return `${dayPrefix(iso, today)}cap a les ${Number(iso.slice(11, 13))} h`;
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

function windowPhrase(w: RainWindow, today: string): string {
  return rangePhrase(w.from, w.to, today);
}

/**
 * «La pluja entra cap a les 15 h i para cap a les 19 h.»
 *
 * Para el titular se dice el principio y el final por separado, no el intervalo.
 * Es la forma en que la gente hace la pregunta —«a quina hora comença a
 * ploure?»— y la que se puede usar para decidir a qué hora salir.
 */
function startStopPhrase(w: RainWindow, today: string): string {
  const h0 = Number(w.from.slice(11, 13));
  const h1 = Number(w.to.slice(11, 13));
  const p0 = dayPrefix(w.from, today);
  if (h0 === h1) return `un ruixat curt ${p0}cap a les ${h0} h`;
  const p1 = dayPrefix(w.to, today);
  return `entra ${p0}cap a les ${h0} h i para ${p1}cap a les ${h1 + 1} h`;
}

// ── Consejos de decisión ────────────────────────────────────────────────────

export type AdviceTone = 'good' | 'info' | 'warn' | 'bad';

export interface Advice {
  key: string;
  /** La pregunta, tal como la haría alguien. */
  question: string;
  /** La respuesta corta. */
  answer: string;
  detail?: string;
  tone: AdviceTone;
}

/**
 * Las preguntas que la gente hace de verdad.
 *
 * Nadie busca «probabilitat de precipitació 62 %»: busca si tiene que coger el
 * paraguas. Todas las respuestas salen de datos que ya están en la página, así
 * que esto no cuesta ni una petición — solo consiste en decidirse a contestar en
 * vez de dejar el número y marcharse.
 *
 * Se muestran únicamente las que aplican. Un bloque con «no cal paraigua», «no
 * glaçarà», «no fa vent» los 300 días que no pasa nada es ruido.
 */
export function adviceFor(
  hourly: HourlyPoint[],
  nowHour: string,
  today: string,
  windows: RainWindow[],
): Advice[] {
  const from = Math.max(0, hourly.findIndex((h) => h.time.slice(0, 13) === nowHour));
  const next24 = hourly.slice(from, from + 24);
  if (next24.length < 6) return [];

  const out: Advice[] = [];

  // ── Paraguas ──
  const soon = windows.filter((w) => Date.parse(`${w.to}:00`) >= Date.parse(`${nowHour}:00:00`));
  if (soon.length) {
    const first = soon[0];
    out.push({
      key: 'paraigua',
      question: 'Cal paraigua?',
      answer: `Sí, ${windowPhrase(first, today)}`,
      detail: first.mm >= 0.1
        ? `${num(first.mm, 1)} mm previstos, ${first.prob} % de probabilitat`
        : `${first.prob} % de probabilitat, sense acumulació apreciable`,
      tone: first.mm >= 5 ? 'bad' : 'warn',
    });
  } else if (next24.every((h) => (h.precipProbability ?? 0) < 20)) {
    out.push({
      key: 'paraigua',
      question: 'Cal paraigua?',
      answer: 'No, en 24 h',
      tone: 'good',
    });
  }

  // ── Heladas ──
  // La mínima de la noche, no la del día natural: la que interesa es la que cae
  // entre esta tarde y mañana por la mañana, que cruza la medianoche.
  const night = next24.filter((h) => {
    const hh = Number(h.time.slice(11, 13));
    return hh >= 20 || hh <= 9;
  });
  const nightTemps = night.map((h) => h.temperature).filter((v): v is number => v != null);
  if (nightTemps.length >= 4) {
    const min = Math.min(...nightTemps);
    const at = night.find((h) => h.temperature === min);
    if (min <= 0) {
      out.push({
        key: 'glacada',
        question: 'Glaçarà aquesta nit?',
        answer: `Sí, ${num(min, 0)} °C`,
        detail: at ? `mínima ${atPhrase(at.time, today)}` : undefined,
        tone: 'bad',
      });
    } else if (min <= 3) {
      out.push({
        key: 'glacada',
        question: 'Glaçarà aquesta nit?',
        answer: `A tocar, ${num(min, 0)} °C`,
        detail: 'als fondals i les zones arrecerades pot baixar més',
        tone: 'warn',
      });
    }
  }

  // ── Sol ──
  //
  // La **racha contigua**, no el primer y el último elemento de la lista
  // filtrada. Con el filtro simple, a las dos de la tarde las horas con UV alto
  // eran «hoy a las 14» y «mañana a las 13», y el rango salía como «de les 14 a
  // les 14 h»: dos tramos distintos presentados como uno solo.
  const uvRun = longestRun(next24, (h) => (h.uvIndex ?? 0) >= 6);
  if (uvRun.length) {
    const uvMax = Math.max(...uvRun.map((h) => h.uvIndex ?? 0));
    out.push({
      key: 'sol',
      question: 'Cal protecció solar?',
      answer: `Sí, ${rangePhrase(uvRun[0].time, uvRun[uvRun.length - 1].time, today)}`,
      detail: `índex UV màxim de ${uvMax}`,
      tone: uvMax >= 8 ? 'bad' : 'warn',
    });
  }

  // ── Viento ──
  const gusts = next24.map((h) => h.windGust).filter((v): v is number => v != null);
  if (gusts.length) {
    const gmax = msToKmh(Math.max(...gusts));
    if (gmax >= 60) {
      const at = next24.find((h) => h.windGust != null && msToKmh(h.windGust) >= gmax - 1);
      out.push({
        key: 'vent',
        question: 'Farà vent?',
        answer: `Ratxes de ${gmax.toFixed(0)} km/h`,
        detail: at ? `màxim ${atPhrase(at.time, today)}` : undefined,
        tone: gmax >= 90 ? 'bad' : 'warn',
      });
    }
  }

  // ── Tender la ropa ──
  // Cuatro horas seguidas de día, sin lluvia y con el aire no saturado. La
  // humedad importa tanto como la lluvia: a 90 % de humedad la ropa no seca
  // aunque no caiga una gota, y eso lo sabe cualquiera que la haya tendido.
  const dryRun = longestRun(
    next24,
    (h) => h.isDay
      && (h.precipitation ?? 0) < 0.1
      && (h.precipProbability ?? 0) < 30
      && (h.humidity ?? 100) <= 75,
  );
  if (dryRun.length >= 4) {
    out.push({
      key: 'roba',
      question: 'Es pot estendre la roba?',
      answer: `Sí, ${rangePhrase(dryRun[0].time, dryRun[dryRun.length - 1].time, today)}`,
      detail: `${dryRun.length} h seguides sense pluja i amb l'aire sec`,
      tone: 'good',
    });
  }

  // ── Mejor momento para salir ──
  const best = bestOutdoorHour(next24);
  if (best) {
    out.push({
      key: 'sortir',
      question: 'Millor moment per sortir?',
      answer: atPhrase(best.time, today).replace(/^./, (c) => c.toUpperCase()),
      detail: [
        best.temperature != null ? `${num(best.temperature, 0)} °C` : null,
        best.windSpeed != null ? `vent de ${msToKmh(best.windSpeed).toFixed(0)} km/h` : null,
        best.uvIndex != null && best.uvIndex > 0 ? `UV ${best.uvIndex}` : null,
      ].filter(Boolean).join(' · '),
      tone: 'info',
    });
  }

  return out.slice(0, 5);
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

/**
 * La hora más cómoda para estar fuera, entre las de luz.
 *
 * El óptimo se ancla en 18 °C de sensación térmica, que es donde la mayoría de
 * la gente no busca sombra ni abrigo. Penaliza lluvia, ultravioleta y viento con
 * pesos distintos a propósito: la lluvia descarta la hora, el UV la empeora y el
 * viento molesta pero no impide.
 */
function bestOutdoorHour(data: HourlyPoint[]): HourlyPoint | null {
  const daylight = data.filter((h) => h.isDay && h.temperature != null);
  if (daylight.length < 3) return null;

  const score = (h: HourlyPoint): number => {
    const t = h.apparent ?? h.temperature ?? 18;
    let s = Math.abs(t - 18) * 1.0;
    s += (h.precipitation ?? 0) >= 0.1 ? 40 : 0;
    s += (h.precipProbability ?? 0) / 10;
    s += Math.max(0, (h.uvIndex ?? 0) - 5) * 1.5;
    s += Math.max(0, msToKmh(h.windSpeed ?? 0) - 25) * 0.2;
    return s;
  };

  return daylight.reduce((a, b) => (score(b) < score(a) ? b : a));
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
  advice: Advice[];
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
  let change: string | null = null;
  if (windows.length === 1) {
    const w = windows[0];
    change = w.mm >= 0.1
      ? `La pluja ${startStopPhrase(w, today)}, amb ${num(w.mm, 1)} mm previstos.`
      : `Ruixats possibles ${windowPhrase(w, today)} — ${w.prob} % de probabilitat, sense gaire acumulació.`;
  } else if (windows.length > 1) {
    const total = Math.round(windows.reduce((s, w) => s + w.mm, 0) * 10) / 10;
    change = `Ruixats intermitents: ${windows.map((w) => windowPhrase(w, today)).join(' i ')}`
      + (total >= 0.1 ? `, ${num(total, 1)} mm en total.` : '.');
  } else if (d0.gustMax != null && msToKmh(d0.gustMax) >= 60) {
    change = `El que marca el dia és el vent: ratxes de fins a ${msToKmh(d0.gustMax).toFixed(0)} km/h.`;
  } else if (d0.snowLevel != null) {
    change = `Nevarà per damunt dels ${d0.snowLevel} m.`;
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
    advice: adviceFor(forecast.hourly, nowHour, today, windows),
    windows,
  };
}

/** Reexportado para que los componentes no tengan que importar de dos sitios. */
export { hour as hourLabel };
