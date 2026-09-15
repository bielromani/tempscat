/**
 * Els avisos de l'AEMET, dits en català.
 *
 * ## Por qué hay que traducir, y por qué no se traduce el texto
 *
 * **AEMET publica sus avisos en castellano e inglés, y en nada más.** Los
 * ficheros CAP del área 69 traen dos bloques `<info>`, `es-ES` y `en-GB`: no
 * hay una versión catalana que pedir. Así que una página en catalán que
 * enseñara el aviso tal cual acababa diciendo «Aviso de temperaturas máximas de
 * nivel amarillo. Pirineo de Lleida», que es lo que estuvo publicado.
 *
 * Traducir el texto libre de un aviso oficial no se hace: es información de
 * seguridad y reescribirla es asumir una responsabilidad que no nos toca. Lo
 * que sí se puede es **no usar su texto**: el nivel, el fenómeno, la zona, la
 * ventana horaria y el umbral vienen en el CAP como **códigos y números**, no
 * como prosa. `AT` + `groc` + `Pirineo de Lleida` + `35 ºC` es todo lo que hace
 * falta para escribir la tarjeta desde cero, en catalán y sin interpretar nada.
 *
 * El texto original de AEMET no desaparece: va aparte, dicho que es suyo y en
 * su idioma, con el enlace al aviso. Eso es lo honesto en las dos direcciones.
 *
 * Lo natural sería tomar los avisos del **Meteocat**, que los emite en catalán
 * y para este territorio. Hace falta pedirles una clave de API; mientras no
 * esté, esto.
 *
 * ## Como el resto de los ficheros compartidos, este no importa nada
 */

/**
 * Los diez fenómenos del plan Meteoalerta que aparecen en Catalunya, más los
 * dos que no se han visto nunca aquí pero existen en el plan.
 *
 * Si algún día llega un código que no está, la tarjeta lo dice de forma
 * genérica y el texto oficial de AEMET —que sí lo nombra— sigue estando a un
 * clic. El worker lo avisa por el registro.
 */
export const PHENOMENA: Record<string, string> = {
  AT: 'Temperatures màximes',
  BT: 'Temperatures mínimes',
  PR: 'Pluja',
  TO: 'Tempesta',
  NE: 'Nevades',
  NI: 'Boira',
  VI: 'Vent',
  CO: 'Fenòmens costaners',
  AL: 'Allaus',
  VS: 'Pols en suspensió',
  GA: 'Gallegades de vent',
  DE: 'Desglaç',
};

/**
 * Las 21 zonas de aviso de AEMET en Catalunya, con su nombre en catalán.
 *
 * La lista sale de los propios ficheros CAP del área 69, no de una suposición:
 * son exactamente los `areaDesc` que AEMET emite. Los topónimos son los
 * oficiales —«Empordà», no «Ampurdán»; «Val d'Aran», no «Valle de Arán»— y las
 * comarcas y comarques llevan el artículo que les toca cuando lo llevan.
 */
export const ZONES: Record<string, string> = {
  'Ampurdán': 'Empordà',
  'Costa - Ampurdán': 'costa de l’Empordà',
  'Costa - Litoral de Barcelona': 'costa del litoral de Barcelona',
  'Costa - Litoral norte de Tarragona': 'costa del litoral nord de Tarragona',
  'Costa - Litoral sur de Girona': 'costa del litoral sud de Girona',
  'Costa - Litoral sur de Tarragona': 'costa del litoral sud de Tarragona',
  'Depresión central de Barcelona': 'Depressió Central de Barcelona',
  'Depresión central de Lleida': 'Depressió Central de Lleida',
  'Depresión central de Tarragona': 'Depressió Central de Tarragona',
  'Litoral de Barcelona': 'litoral de Barcelona',
  'Litoral norte de Tarragona': 'litoral nord de Tarragona',
  'Litoral sur de Girona': 'litoral sud de Girona',
  'Litoral sur de Tarragona': 'litoral sud de Tarragona',
  'Pirineo de Girona': 'Pirineu de Girona',
  'Pirineo de Lleida': 'Pirineu de Lleida',
  'Prelitoral de Barcelona': 'prelitoral de Barcelona',
  'Prelitoral de Girona': 'prelitoral de Girona',
  'Prelitoral norte de Tarragona': 'prelitoral nord de Tarragona',
  'Prelitoral sur de Tarragona': 'prelitoral sud de Tarragona',
  'Prepirineo de Barcelona': 'Prepirineu de Barcelona',
  'Valle de Arán': 'Val d’Aran',
};

/** El fenómeno en catalán. Genérico si el código no consta. */
export function phenomenonName(code: string): string {
  return PHENOMENA[code] ?? 'Avís meteorològic';
}

/** La zona en catalán. Tal cual si no consta, que es mejor que callarla. */
export function zoneName(desc: string): string {
  return ZONES[desc] ?? desc;
}

/**
 * En quant de temps s'acumula el que mesura el llindar, si s'acumula.
 *
 * «Precipitación acumulada en 12 horas» → `12 h`. La temperatura màxima no
 * n'acumula cap i torna null.
 */
function accumulationWindow(param: string): string | null {
  const m = param.match(/en\s+(una?|\d+)\s+(hores?|horas?|minuts?|minutos?)/i);
  if (!m) return null;
  const n = /^\d+$/.test(m[1]) ? m[1] : '1';
  return /^min/i.test(m[2]) ? `${n} min` : `${n} h`;
}

/**
 * El umbral, sin la etiqueta y con el signo de grado de verdad.
 *
 * AEMET manda el parámetro como `TA;Temperatura máxima;35 ºC`: un código, un
 * nombre en castellano y un valor. **El nombre no hace falta traducirlo porque
 * no hace falta enseñarlo**: el título de la tarjeta ya dice que el aviso es de
 * temperaturas máximas, así que «Temperatures màximes · 35 °C» lo dice todo y
 * «Temperatures màximes · Temperatura màxima 35 °C» solo lo repite.
 *
 * Y el `º` de AEMET es el **ordinal masculino**, no el signo de grado. Son dos
 * caracteres distintos: el ordinal se dibuja más pequeño y más alto, y al lado
 * de un `°C` bien puesto se ve.
 *
 * ## La finestra d'acumulació sí que s'ha de dir
 *
 * Perquè sense ella dos avisos de pluja del mateix lloc es llegeixen com el
 * mateix avís repetit. Agullana, el 16 de setembre de 2026, en tenia dos:
 *
 *     taronja  Pluja  100 mm en 12 h
 *     groc     Pluja   20 mm en 1 h
 *
 * Sense la finestra sortien «Pluja 100 mm» i «Pluja 20 mm», i aleshores el groc
 * sembla el taronja dit fluix i sobra. **No sobra**: un és una pluja llarga que
 * omple rieres i l'altre és un xàfec que inunda un pas soterrat en una hora.
 * Són dues coses diferents, es preparen diferent, i la diferència és justament
 * la part que abans no es dibuixava.
 *
 * ## I un llindar sense número no és un llindar
 *
 * Els avisos de tempesta arriben amb `Tormentas · ` —el valor és buit— i
 * agafant l'últim tros no buit sortia la paraula **en castellà** al costat del
 * nom en català: «Tempesta Tormentas». Un valor sense cap xifra és l'etiqueta
 * repetida, no una mesura, i el títol de la targeta ja diu el fenomen.
 */
export function thresholdValue(threshold: string | undefined): string | null {
  if (!threshold) return null;
  const parts = threshold.split(/[;·]/).map((p) => p.trim()).filter(Boolean);
  const value = parts.at(-1);
  if (!value || !/\d/.test(value)) return null;

  const clean = value.replace(/º/g, '°').replace(/\s+/g, ' ');
  const window = parts.length > 1 ? accumulationWindow(parts.slice(0, -1).join(' ')) : null;
  return window ? `${clean} en ${window}` : clean;
}

/** «del 40 % al 70 %», que es como se escribe un rango en catalán. */
export function probabilityText(probability: string | undefined): string | null {
  if (!probability) return null;
  const m = probability.match(/^(\d+)\s*%\s*-\s*(\d+)\s*%$/);
  if (m) return `del ${m[1]} % al ${m[2]} %`;
  return probability.replace(/(\d)%/g, '$1 %');
}
